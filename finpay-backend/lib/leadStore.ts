/**
 * Persistence for the two marketing forms — customer feedback and B2B/wholesale
 * tasting requests. Mirrors lib/db.ts's Postgres-or-file-store pattern so both
 * work with or without DATABASE_URL. These rows are the durable record; the
 * Resend email (lib/notify.ts) is the notification on top.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";

export interface FeedbackRow {
  id: string;
  rating: number;
  name: string;
  flavour: string | null;
  message: string | null;
  createdAt: string;
}
export interface WholesaleRow {
  id: string;
  name: string;
  role: string;
  cafe: string;
  city: string;
  contact: string;
  volume: string | null;
  followedUp: boolean;
  createdAt: string;
}
export interface FeedbackInput { rating: number; name: string; flavour?: string; message?: string }
export interface WholesaleInput { name: string; role: string; cafe: string; city: string; contact: string; volume?: string }

export interface LeadStore {
  init(): Promise<void>;
  saveFeedback(input: FeedbackInput): Promise<FeedbackRow>;
  saveWholesale(input: WholesaleInput): Promise<WholesaleRow>;
  /** Reviews for the public showcase: rating >= minRating, non-empty message, newest first. */
  listFeedback(opts?: { minRating?: number; limit?: number }): Promise<FeedbackRow[]>;
  /** All wholesale/tasting requests, newest first (admin). */
  listWholesale(): Promise<WholesaleRow[]>;
  /** Flag/unflag a wholesale request as followed up (admin). */
  setWholesaleFollowedUp(id: string, value: boolean): Promise<void>;
}

function newId(): string {
  return crypto.randomBytes(8).toString("hex");
}

// ---------------------------------------------------------------- File store (dev)
const FB_PATH = path.join(process.cwd(), ".dev-data", "feedback.json");
const WS_PATH = path.join(process.cwd(), ".dev-data", "wholesale.json");

class FileLeadStore implements LeadStore {
  private lock: Promise<unknown> = Promise.resolve();
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.then(() => undefined, () => undefined);
    return run;
  }
  private async readAll<T>(p: string): Promise<T[]> {
    try {
      return JSON.parse(await fs.readFile(p, "utf8")) as T[];
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  private async writeAll<T>(p: string, rows: T[]): Promise<void> {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
    await fs.rename(tmp, p);
  }
  async init(): Promise<void> {
    await fs.mkdir(path.join(process.cwd(), ".dev-data"), { recursive: true });
  }
  saveFeedback(input: FeedbackInput): Promise<FeedbackRow> {
    return this.serialize(async () => {
      const rows = await this.readAll<FeedbackRow>(FB_PATH);
      const row: FeedbackRow = {
        id: newId(), rating: input.rating, name: input.name,
        flavour: input.flavour ?? null, message: input.message ?? null,
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      await this.writeAll(FB_PATH, rows);
      return row;
    });
  }
  saveWholesale(input: WholesaleInput): Promise<WholesaleRow> {
    return this.serialize(async () => {
      const rows = await this.readAll<WholesaleRow>(WS_PATH);
      const row: WholesaleRow = {
        id: newId(), name: input.name, role: input.role, cafe: input.cafe,
        city: input.city, contact: input.contact, volume: input.volume ?? null,
        followedUp: false, createdAt: new Date().toISOString(),
      };
      rows.push(row);
      await this.writeAll(WS_PATH, rows);
      return row;
    });
  }
  async listFeedback(opts?: { minRating?: number; limit?: number }): Promise<FeedbackRow[]> {
    const minRating = opts?.minRating ?? 4;
    const limit = opts?.limit ?? 50;
    const rows = await this.readAll<FeedbackRow>(FB_PATH);
    return rows
      .filter((r) => r.rating >= minRating && (r.message ?? "").trim() !== "")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async listWholesale(): Promise<WholesaleRow[]> {
    const rows = await this.readAll<WholesaleRow>(WS_PATH);
    return rows
      .map((r) => ({ ...r, followedUp: r.followedUp ?? false }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  setWholesaleFollowedUp(id: string, value: boolean): Promise<void> {
    return this.serialize(async () => {
      const rows = await this.readAll<WholesaleRow>(WS_PATH);
      const row = rows.find((r) => r.id === id);
      if (row) { row.followedUp = value; await this.writeAll(WS_PATH, rows); }
    });
  }
}

// ---------------------------------------------------------------- Postgres store
const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  rating     INTEGER NOT NULL,
  name       TEXT NOT NULL,
  flavour    TEXT,
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wholesale_requests (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  cafe       TEXT NOT NULL,
  city       TEXT NOT NULL,
  contact    TEXT NOT NULL,
  volume     TEXT,
  followed_up BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wholesale_requests ADD COLUMN IF NOT EXISTS followed_up BOOLEAN NOT NULL DEFAULT false;`;

class PostgresLeadStore implements LeadStore {
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
  async init(): Promise<void> {
    const pool = await this.pool();
    await pool.query(CREATE_SQL);
  }
  async saveFeedback(input: FeedbackInput): Promise<FeedbackRow> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `INSERT INTO feedback (id, rating, name, flavour, message) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newId(), input.rating, input.name, input.flavour ?? null, input.message ?? null],
    );
    const r = rows[0];
    return { id: r.id, rating: Number(r.rating), name: r.name, flavour: r.flavour ?? null, message: r.message ?? null, createdAt: new Date(r.created_at).toISOString() };
  }
  async saveWholesale(input: WholesaleInput): Promise<WholesaleRow> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `INSERT INTO wholesale_requests (id, name, role, cafe, city, contact, volume) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [newId(), input.name, input.role, input.cafe, input.city, input.contact, input.volume ?? null],
    );
    const r = rows[0];
    return { id: r.id, name: r.name, role: r.role, cafe: r.cafe, city: r.city, contact: r.contact, volume: r.volume ?? null, followedUp: r.followed_up ?? false, createdAt: new Date(r.created_at).toISOString() };
  }
  async listFeedback(opts?: { minRating?: number; limit?: number }): Promise<FeedbackRow[]> {
    const pool = await this.pool();
    const { rows } = await pool.query(
      `SELECT * FROM feedback WHERE rating >= $1 AND message IS NOT NULL AND btrim(message) <> ''
       ORDER BY created_at DESC LIMIT $2`,
      [opts?.minRating ?? 4, opts?.limit ?? 50],
    );
    return rows.map((r) => ({ id: r.id, rating: Number(r.rating), name: r.name, flavour: r.flavour ?? null, message: r.message ?? null, createdAt: new Date(r.created_at).toISOString() }));
  }
  async listWholesale(): Promise<WholesaleRow[]> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM wholesale_requests ORDER BY created_at DESC");
    return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, cafe: r.cafe, city: r.city, contact: r.contact, volume: r.volume ?? null, followedUp: r.followed_up ?? false, createdAt: new Date(r.created_at).toISOString() }));
  }
  async setWholesaleFollowedUp(id: string, value: boolean): Promise<void> {
    const pool = await this.pool();
    await pool.query("UPDATE wholesale_requests SET followed_up = $2 WHERE id = $1", [id, value]);
  }
}

let _store: LeadStore | null = null;
export function getLeadStore(): LeadStore {
  if (_store) return _store;
  _store = env.databaseUrl ? new PostgresLeadStore() : new FileLeadStore();
  return _store;
}
