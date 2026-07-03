/**
 * Saved-address storage, mirroring lib/db.ts's Postgres-or-file-store
 * pattern. Keyed by the mock session's user id (lib/session.ts).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";
import type { DeliveryAddress } from "./orders";

export interface SavedAddress extends DeliveryAddress {
  id: string;
  userId: string;
  label: string;
  createdAt: string;
}

export interface AddressStore {
  init(): Promise<void>;
  list(userId: string): Promise<SavedAddress[]>;
  create(userId: string, label: string, address: DeliveryAddress): Promise<SavedAddress>;
}

const DEV_PATH = path.join(process.cwd(), ".dev-data", "addresses.json");

class FileAddressStore implements AddressStore {
  private lock: Promise<unknown> = Promise.resolve();

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readAll(): Promise<SavedAddress[]> {
    try {
      const raw = await fs.readFile(DEV_PATH, "utf8");
      return JSON.parse(raw) as SavedAddress[];
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  private async writeAll(rows: SavedAddress[]): Promise<void> {
    await fs.mkdir(path.dirname(DEV_PATH), { recursive: true });
    const tmp = `${DEV_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
    await fs.rename(tmp, DEV_PATH);
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(DEV_PATH), { recursive: true });
  }

  async list(userId: string): Promise<SavedAddress[]> {
    const all = await this.readAll();
    return all.filter((a) => a.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(userId: string, label: string, address: DeliveryAddress): Promise<SavedAddress> {
    return this.serialize(async () => {
      const all = await this.readAll();
      const row: SavedAddress = {
        id: crypto.randomBytes(6).toString("hex"),
        userId,
        label,
        ...address,
        createdAt: new Date().toISOString(),
      };
      all.push(row);
      await this.writeAll(all);
      return row;
    });
  }
}

class PostgresAddressStore implements AddressStore {
  private poolPromise: Promise<import("pg").Pool> | null = null;

  private async pool(): Promise<import("pg").Pool> {
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        const mod = await import("pg");
        const Pool = mod.Pool ?? (mod.default as typeof mod | undefined)?.Pool;
        if (!Pool) throw new Error("pg module did not expose a Pool export");
        return new Pool({ connectionString: env.databaseUrl });
      })();
    }
    return this.poolPromise;
  }

  private rowToAddress(r: Record<string, unknown>): SavedAddress {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      label: r.label as string,
      recipientName: r.recipient_name as string,
      phone: r.phone as string,
      area: r.area as string,
      fullAddress: r.full_address as string,
      notes: (r.notes as string) ?? undefined,
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }

  async init(): Promise<void> {
    const pool = await this.pool();
    const schema = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    await pool.query(schema);
  }

  async list(userId: string): Promise<SavedAddress[]> {
    const pool = await this.pool();
    const { rows } = await pool.query(`SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows.map((r) => this.rowToAddress(r));
  }

  async create(userId: string, label: string, address: DeliveryAddress): Promise<SavedAddress> {
    const pool = await this.pool();
    const id = crypto.randomBytes(6).toString("hex");
    const { rows } = await pool.query(
      `INSERT INTO addresses (id, user_id, label, recipient_name, phone, area, full_address, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, userId, label, address.recipientName, address.phone, address.area, address.fullAddress, address.notes ?? null],
    );
    return this.rowToAddress(rows[0]);
  }
}

let _store: AddressStore | null = null;

export function getAddressStore(): AddressStore {
  if (_store) return _store;
  _store = env.databaseUrl ? new PostgresAddressStore() : new FileAddressStore();
  return _store;
}
