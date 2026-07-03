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
import type { Order, OrderStatus, OrderItem, Customer, DeliveryAddress, CourierChoice, FulfillmentStage } from "./orders";

export interface NewOrderInput {
  id: string;
  items: OrderItem[];
  amount: number;
  customer: Customer;
  status: OrderStatus;
  deliveryAddress: DeliveryAddress | null;
  deliveryDate: string | null;
  courier: CourierChoice | null;
  userId: string | null;
}

export interface OrderUpdate {
  status?: OrderStatus;
  finpay_reference?: string | null;
  redirect_url?: string | null;
  expiry_link?: string | null;
  fulfillment_stage?: FulfillmentStage | null;
}

export interface OrderStore {
  init(): Promise<void>;
  create(input: NewOrderInput): Promise<Order>;
  get(id: string): Promise<Order | null>;
  update(id: string, patch: OrderUpdate): Promise<Order | null>;
  appendCallback(id: string, entry: unknown): Promise<Order | null>;
  list(filter?: { status?: OrderStatus; userId?: string }): Promise<Order[]>;
  /** PENDING orders whose expiry_link is before `before` (for reconciliation). */
  findStalePending(before: string): Promise<Order[]>;
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
        finpay_reference: null,
        redirect_url: null,
        expiry_link: null,
        callback_log: [],
        delivery_address: input.deliveryAddress,
        delivery_date: input.deliveryDate,
        courier: input.courier,
        fulfillment_stage: null,
        user_id: input.userId,
        created_at: now,
        updated_at: now,
      };
      all[order.id] = order;
      await this.writeAll(all);
      return order;
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
// Postgres store
// ---------------------------------------------------------------------------

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

  private rowToOrder(r: Record<string, unknown>): Order {
    return {
      id: r.id as string,
      items: r.items as OrderItem[],
      amount: Number(r.amount),
      customer: r.customer as Customer,
      status: r.status as OrderStatus,
      finpay_reference: (r.finpay_reference as string) ?? null,
      redirect_url: (r.redirect_url as string) ?? null,
      expiry_link: r.expiry_link ? new Date(r.expiry_link as string).toISOString() : null,
      callback_log: (r.callback_log as unknown[]) ?? [],
      delivery_address: (r.delivery_address as Order["delivery_address"]) ?? null,
      delivery_date: (r.delivery_date as string) ?? null,
      courier: (r.courier as Order["courier"]) ?? null,
      fulfillment_stage: (r.fulfillment_stage as Order["fulfillment_stage"]) ?? null,
      user_id: (r.user_id as string) ?? null,
      created_at: new Date(r.created_at as string).toISOString(),
      updated_at: new Date(r.updated_at as string).toISOString(),
    };
  }

  async init(): Promise<void> {
    const pool = await this.pool();
    const schema = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    await pool.query(schema);
  }

  async create(input: NewOrderInput): Promise<Order> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `INSERT INTO orders (id, items, amount, customer, status, delivery_address, delivery_date, courier, user_id)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6::jsonb, $7, $8::jsonb, $9)
       RETURNING *`,
      [
        input.id,
        JSON.stringify(input.items),
        input.amount,
        JSON.stringify(input.customer),
        input.status,
        input.deliveryAddress ? JSON.stringify(input.deliveryAddress) : null,
        input.deliveryDate,
        input.courier ? JSON.stringify(input.courier) : null,
        input.userId,
      ],
    );
    return this.rowToOrder(rows[0]);
  }

  async get(id: string): Promise<Order | null> {
    const pool = await this.pool();
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async update(id: string, patch: OrderUpdate): Promise<Order | null> {
    const pool = await this.pool();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
    if (sets.length === 0) return this.get(id);
    sets.push(`updated_at = now()`);
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE orders SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      vals,
    );
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async appendCallback(id: string, entry: unknown): Promise<Order | null> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `UPDATE orders
         SET callback_log = callback_log || $2::jsonb, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, JSON.stringify([entry])],
    );
    return rows[0] ? this.rowToOrder(rows[0]) : null;
  }

  async list(filter?: { status?: OrderStatus; userId?: string }): Promise<Order[]> {
    const pool = await this.pool();
    const conditions: string[] = [];
    const vals: unknown[] = [];
    if (filter?.status) {
      vals.push(filter.status);
      conditions.push(`status = $${vals.length}`);
    }
    if (filter?.userId) {
      vals.push(filter.userId);
      conditions.push(`user_id = $${vals.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, vals);
    return rows.map((r) => this.rowToOrder(r));
  }

  async findStalePending(before: string): Promise<Order[]> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE status = 'PENDING' AND expiry_link IS NOT NULL AND expiry_link < $1`,
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
