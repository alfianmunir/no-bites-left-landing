/**
 * Order storage abstraction.
 *
 * - Production: Postgres (Supabase/Neon) when DATABASE_URL is set.
 * - Local dev / Phase 1 testing: a file-backed store (no external service),
 *   selected automatically when DATABASE_URL is empty.
 *
 * Both implementations expose the same OrderStore interface so route code is
 * storage-agnostic. Server-only module.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";
import type {
  Order,
  OrderStatus,
  OrderItem,
  Customer,
  DeliveryAddress,
  CourierChoice,
  Fulfillment,
  StatusActor,
  StatusEvent,
} from "./orders";

export interface NewOrderInput {
  id: string;
  items: OrderItem[];
  amount: number;
  customer: Customer;
  status: OrderStatus;
  fulfillment: Fulfillment;
  pickupDate: string | null;
  pickupLocationId?: string | null; // multi-location v1
  pickupLocation?: { name: string; area: string } | null; // denormalized display snapshot
  userId: string | null;
  // v2 delivery (null for PICKUP orders)
  deliveryAddress?: DeliveryAddress | null;
  deliveryDate?: string | null;
  courier?: CourierChoice | null;
}

/**
 * Non-status field patches only. Status changes go through `setStatus` so the
 * status_history audit trail (E2E PRD §6) is always appended atomically.
 */
export interface OrderUpdate {
  finpay_reference?: string | null;
  redirect_url?: string | null;
  expiry_link?: string | null;
  // Pickup date can be re-stamped by the webhook when the async paid-time floor
  // pushes it out (README §6 auto-bump). Column exists on both stores.
  pickup_date?: string | null;
}

export interface OrderStore {
  init(): Promise<void>;
  create(input: NewOrderInput): Promise<Order>;
  get(id: string): Promise<Order | null>;
  update(id: string, patch: OrderUpdate): Promise<Order | null>;
  /** Transition status + append a status_history event ({status, at, by}). */
  setStatus(id: string, status: OrderStatus, by: StatusActor, note?: string): Promise<Order | null>;
  appendCallback(id: string, entry: unknown): Promise<Order | null>;
  list(filter?: { status?: OrderStatus; userId?: string }): Promise<Order[]>;
  /** PENDING orders whose expiry_link is before `before` (for reconciliation). */
  findStalePending(before: string): Promise<Order[]>;
}

function statusEvent(status: OrderStatus, by: StatusActor, note?: string): StatusEvent {
  return { status, at: new Date().toISOString(), by, ...(note ? { note } : {}) };
}

// ---------------------------------------------------------------------------
// File-backed dev store
// ---------------------------------------------------------------------------

const DEV_DB_PATH = path.join(process.cwd(), ".dev-data", "orders.json");

class FileStore implements OrderStore {
  // Serialize all mutations through a single promise chain to avoid
  // read-modify-write races (important once the webhook lands in Phase 2).
  private lock: Promise<unknown> = Promise.resolve();

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    // keep the chain alive but swallow errors so one failure doesn't wedge it
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readAll(): Promise<Record<string, Order>> {
    try {
      const raw = await fs.readFile(DEV_DB_PATH, "utf8");
      return JSON.parse(raw) as Record<string, Order>;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw e;
    }
  }

  private async writeAll(data: Record<string, Order>): Promise<void> {
    await fs.mkdir(path.dirname(DEV_DB_PATH), { recursive: true });
    const tmp = `${DEV_DB_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, DEV_DB_PATH); // atomic replace
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(DEV_DB_PATH), { recursive: true });
  }

  create(input: NewOrderInput): Promise<Order> {
    return this.serialize(async () => {
      const all = await this.readAll();
      if (all[input.id]) throw new Error(`Order ${input.id} already exists`);
      const now = new Date().toISOString();
      const order: Order = {
        id: input.id,
        items: input.items,
        amount: input.amount,
        customer: input.customer,
        status: input.status,
        fulfillment: input.fulfillment,
        pickup_date: input.pickupDate ?? null,
        pickup_location_id: input.pickupLocationId ?? null,
        pickup_location: input.pickupLocation ?? null,
        finpay_reference: null,
        redirect_url: null,
        expiry_link: null,
        callback_log: [],
        status_history: [statusEvent(input.status, "system")],
        delivery_address: input.deliveryAddress ?? null,
        delivery_date: input.deliveryDate ?? null,
        courier: input.courier ?? null,
        user_id: input.userId,
        created_at: now,
        updated_at: now,
      };
      all[order.id] = order;
      await this.writeAll(all);
      return order;
    });
  }

  setStatus(id: string, status: OrderStatus, by: StatusActor, note?: string): Promise<Order | null> {
    return this.serialize(async () => {
      const all = await this.readAll();
      const cur = all[id];
      if (!cur) return null;
      const next: Order = {
        ...cur,
        status,
        status_history: [...(cur.status_history ?? []), statusEvent(status, by, note)],
        updated_at: new Date().toISOString(),
      };
      all[id] = next;
      await this.writeAll(all);
      return next;
    });
  }

  async get(id: string): Promise<Order | null> {
    const all = await this.readAll();
    return all[id] ?? null;
  }

  update(id: string, patch: OrderUpdate): Promise<Order | null> {
    return this.serialize(async () => {
      const all = await this.readAll();
      const cur = all[id];
      if (!cur) return null;
      const next: Order = { ...cur, ...patch, updated_at: new Date().toISOString() };
      all[id] = next;
      await this.writeAll(all);
      return next;
    });
  }

  appendCallback(id: string, entry: unknown): Promise<Order | null> {
    return this.serialize(async () => {
      const all = await this.readAll();
      const cur = all[id];
      if (!cur) return null;
      cur.callback_log = [...(cur.callback_log ?? []), entry];
      cur.updated_at = new Date().toISOString();
      all[id] = cur;
      await this.writeAll(all);
      return cur;
    });
  }

  async list(filter?: { status?: OrderStatus; userId?: string }): Promise<Order[]> {
    const all = await this.readAll();
    let rows = Object.values(all);
    if (filter?.status) rows = rows.filter((o) => o.status === filter.status);
    if (filter?.userId) rows = rows.filter((o) => o.user_id === filter.userId);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async findStalePending(before: string): Promise<Order[]> {
    const all = await this.readAll();
    return Object.values(all).filter(
      (o) => o.status === "PENDING" && o.expiry_link !== null && o.expiry_link < before,
    );
  }
}

// ---------------------------------------------------------------------------
// Postgres store — backed by ops.sales_orders (Phase 10).
//
// The consumer + payment domain speaks a single-axis Order.status
// (PENDING→PAID→BAKING→READY_FOR_PICKUP→PICKED_UP…). ops.sales_orders records
// the same lifecycle across three columns (payment_status / status /
// fulfillment_status) plus per-transition timestamps. These two helpers map
// between the two so every getStore() caller keeps working unchanged while the
// underlying table is now sales_orders. public.orders is retired.
// ---------------------------------------------------------------------------

/** Derive the single-axis Order.status from the ops.sales_orders 3-axis columns. */
function deriveOrderStatus(r: Record<string, unknown>): OrderStatus {
  const st = r.status as string;
  const pay = r.payment_status as string;
  const ff = r.fulfillment_status as string;
  if (st === "cancelled") return "CANCELLED";
  if (st === "expired") return "EXPIRED";
  if (st === "refunded") return "REFUNDED";
  if (pay !== "paid") return "PENDING";
  switch (ff) {
    case "picked_up": return "PICKED_UP";
    case "ready_for_pickup": return "READY_FOR_PICKUP";
    case "packed": return "BAKING";
    case "delivered": return "DELIVERED";
    case "in_delivery": return "OUT_FOR_DELIVERY";
    default: return "PAID"; // preparing
  }
}

/** The ops columns a single-axis status drives, + which timestamp it stamps. */
function columnsForStatus(status: OrderStatus): {
  payment_status?: string;
  status?: string;
  fulfillment_status?: string;
  stamp?: "paid_at" | "packed_at" | "ready_at" | "fulfilled_at";
} {
  switch (status) {
    case "PENDING": return { payment_status: "unpaid", status: "pending" };
    case "PAID": return { payment_status: "paid", status: "confirmed", fulfillment_status: "preparing", stamp: "paid_at" };
    case "BAKING": return { payment_status: "paid", status: "confirmed", fulfillment_status: "packed", stamp: "packed_at" };
    case "READY_FOR_PICKUP": return { payment_status: "paid", status: "confirmed", fulfillment_status: "ready_for_pickup", stamp: "ready_at" };
    case "PICKED_UP": return { payment_status: "paid", status: "fulfilled", fulfillment_status: "picked_up", stamp: "fulfilled_at" };
    case "OUT_FOR_DELIVERY": return { payment_status: "paid", status: "confirmed", fulfillment_status: "in_delivery" };
    case "DELIVERED": return { payment_status: "paid", status: "fulfilled", fulfillment_status: "delivered", stamp: "fulfilled_at" };
    case "EXPIRED": return { status: "expired" };
    case "CANCELLED": return { status: "cancelled" };
    case "REFUNDED": return { status: "refunded" };
  }
}

class PostgresStore implements OrderStore {
  // Lazy import so `pg` is only loaded when actually used.
  private poolPromise: Promise<import("pg").Pool> | null = null;

  private async pool(): Promise<import("pg").Pool> {
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        // `pg` is CJS; under some ESM loaders (tsx, Next's Node runtime) its
        // named exports don't get flattened, so `Pool` may be undefined here —
        // fall back to the default export's property in that case.
        const mod = await import("pg");
        const Pool = mod.Pool ?? (mod.default as typeof mod | undefined)?.Pool;
        const types = mod.types ?? (mod.default as typeof mod | undefined)?.types;
        if (!Pool) throw new Error("pg module did not expose a Pool export");
        // By default node-postgres parses DATE (oid 1082) into a JS Date using
        // the process's LOCAL timezone, so .toISOString() later shifts by a
        // day whenever the server isn't UTC (bit us at Asia/Jakarta, UTC+7).
        // delivery_date is a plain calendar date with no time component, so
        // keep it as the raw "YYYY-MM-DD" string Postgres sends — no Date
        // object, no timezone to get wrong.
        types?.setTypeParser(1082, (val: string) => val);
        return new Pool({ connectionString: env.databaseUrl });
      })();
    }
    return this.poolPromise;
  }

  // The website channel id (ops.sales_orders.channel_id), looked up once.
  private channelIdPromise: Promise<string> | null = null;
  private async websiteChannelId(): Promise<string> {
    if (!this.channelIdPromise) {
      this.channelIdPromise = (async () => {
        const pool = await this.pool();
        const { rows } = await pool.query(`SELECT id FROM ops.channels WHERE name = 'website' LIMIT 1`);
        if (!rows[0]) throw new Error("ops.channels has no 'website' channel");
        return rows[0].id as string;
      })();
    }
    return this.channelIdPromise;
  }

  private rowToOrder(r: Record<string, unknown>): Order {
    return {
      id: r.order_no as string,
      items: (r.items as OrderItem[]) ?? [],
      amount: Number(r.amount),
      customer: r.customer as Customer,
      status: deriveOrderStatus(r),
      fulfillment: ((r.fulfillment as Fulfillment) ?? "PICKUP"),
      pickup_date: (r.pickup_date as string) ?? null,
      pickup_location_id: (r.pickup_location_id as string) ?? null,
      pickup_location: (r.pickup_location as { name: string; area: string } | null) ?? null,
      finpay_reference: (r.finpay_reference as string) ?? null,
      redirect_url: (r.redirect_url as string) ?? null,
      expiry_link: r.expiry_link ? new Date(r.expiry_link as string).toISOString() : null,
      callback_log: (r.callback_log as unknown[]) ?? [],
      status_history: (r.status_history as StatusEvent[]) ?? [],
      // Delivery is dormant (v1 pickup only) and not stored on sales_orders.
      delivery_address: null,
      delivery_date: null,
      courier: null,
      user_id: (r.user_id as string) ?? null,
      created_at: new Date(r.ordered_at as string).toISOString(),
      updated_at: new Date(r.updated_at as string).toISOString(),
    };
  }

  async init(): Promise<void> {
    // ops.sales_orders + the rest of the ops schema are managed by db/ops-*.sql
    // migrations, not by this app. schema.sql still owns the other public tables
    // (addresses, feedback, wholesale_requests, menu_items, + the archived
    // orders table), so keep applying it — it's idempotent (IF NOT EXISTS).
    const pool = await this.pool();
    const schema = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    await pool.query(schema);
  }

  async create(input: NewOrderInput): Promise<Order> {
    const pool = await this.pool();
    const channelId = await this.websiteChannelId();
    const c = columnsForStatus(input.status);
    const { rows } = await pool.query(
      `INSERT INTO ops.sales_orders
         (channel_id, order_no, customer, customer_ref, user_id, items, amount, pickup_date,
          pickup_location_id, pickup_location,
          fulfillment, payment_status, status, fulfillment_status, status_history)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15::jsonb)
       RETURNING *`,
      [
        channelId,
        input.id,
        JSON.stringify(input.customer),
        input.customer?.firstName ?? "Website",
        input.userId,
        JSON.stringify(input.items),
        input.amount,
        input.pickupDate ?? null,
        input.pickupLocationId ?? null,
        input.pickupLocation ? JSON.stringify(input.pickupLocation) : null,
        input.fulfillment,
        c.payment_status ?? "unpaid",
        c.status ?? "pending",
        c.fulfillment_status ?? "preparing",
        JSON.stringify([statusEvent(input.status, "system")]),
      ],
    );
    return this.rowToOrder(rows[0]);
  }

  async setStatus(id: string, status: OrderStatus, by: StatusActor, note?: string): Promise<Order | null> {
    const pool = await this.pool();
    const c = columnsForStatus(status);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (c.payment_status) { sets.push(`payment_status = $${i++}`); vals.push(c.payment_status); }
    if (c.status) { sets.push(`status = $${i++}`); vals.push(c.status); }
    if (c.fulfillment_status) { sets.push(`fulfillment_status = $${i++}`); vals.push(c.fulfillment_status); }
    // Stamp the transition time once (don't clobber an earlier stamp on replay).
    if (c.stamp) sets.push(`${c.stamp} = COALESCE(${c.stamp}, now())`);
    sets.push(`status_history = COALESCE(status_history, '[]'::jsonb) || $${i++}::jsonb`);
    vals.push(JSON.stringify([statusEvent(status, by, note)]));
    sets.push(`updated_at = now()`);
    vals.push(id); // WHERE order_no
    const { rows } = await pool.query(
      `UPDATE ops.sales_orders SET ${sets.join(", ")} WHERE order_no = $${i} RETURNING *`,
      vals,
    );
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async get(id: string): Promise<Order | null> {
    const pool = await this.pool();
    const { rows } = await pool.query(`SELECT * FROM ops.sales_orders WHERE order_no = $1`, [id]);
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async update(id: string, patch: OrderUpdate): Promise<Order | null> {
    const pool = await this.pool();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = $${i++}`); // keys are fixed OrderUpdate fields (finpay_reference/redirect_url/expiry_link)
      vals.push(v);
    }
    if (sets.length === 0) return this.get(id);
    sets.push(`updated_at = now()`);
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE ops.sales_orders SET ${sets.join(", ")} WHERE order_no = $${i} RETURNING *`,
      vals,
    );
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async appendCallback(id: string, entry: unknown): Promise<Order | null> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `UPDATE ops.sales_orders
         SET callback_log = COALESCE(callback_log, '[]'::jsonb) || $2::jsonb, updated_at = now()
       WHERE order_no = $1 RETURNING *`,
      [id, JSON.stringify([entry])],
    );
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async list(filter?: { status?: OrderStatus; userId?: string }): Promise<Order[]> {
    const pool = await this.pool();
    // order_no IS NOT NULL restricts to website orders (native storefront rows);
    // other-channel sales_orders (direct/b2b/…) aren't part of this domain.
    const conditions: string[] = ["order_no IS NOT NULL"];
    const vals: unknown[] = [];
    if (filter?.userId) {
      vals.push(filter.userId);
      conditions.push(`user_id = $${vals.length}`);
    }
    const { rows } = await pool.query(
      `SELECT * FROM ops.sales_orders WHERE ${conditions.join(" AND ")} ORDER BY ordered_at DESC`,
      vals,
    );
    let orders = rows.map((r) => this.rowToOrder(r));
    // status is single-axis (derived), so filter it in JS after mapping.
    if (filter?.status) orders = orders.filter((o) => o.status === filter.status);
    return orders;
  }

  async findStalePending(before: string): Promise<Order[]> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `SELECT * FROM ops.sales_orders
        WHERE order_no IS NOT NULL AND payment_status = 'unpaid' AND status = 'pending'
          AND expiry_link IS NOT NULL AND expiry_link < $1`,
      [before],
    );
    return rows.map((r) => this.rowToOrder(r));
  }
}

// ---------------------------------------------------------------------------

let _store: OrderStore | null = null;

export function getStore(): OrderStore {
  if (_store) return _store;
  _store = env.databaseUrl ? new PostgresStore() : new FileStore();
  return _store;
}

export const usingPostgres = Boolean(env.databaseUrl);
