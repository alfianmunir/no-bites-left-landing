/**
 * Pickup-location catalog + settings store (multi-location v1).
 *
 * Locations are admin-managed and read by the storefront, so they live in a
 * `pickup_locations` table (not a static const) — mirrors lib/menuStore.ts's
 * Postgres-or-seed pattern: Postgres impl when DATABASE_URL is set, an in-code
 * seed store otherwise (dev preview). Both auto-seed the five launch locations
 * on first init if the table is empty, so the calendar path is never dead.
 *
 * `rule` is the discriminated union from lib/pickup.ts (SINGLE source of the
 * availability logic). This module only persists it.
 */
import { env } from "./env";
import type { PickupLocation, PickupRule, PickupSettings } from "./pickup";
import { DEFAULT_PICKUP_SETTINGS } from "./pickup";

// The five launch locations (mirrors db/pickup-multilocation.sql seed).
export const SEED_LOCATIONS: PickupLocation[] = [
  { id: "paragon-c", name: "Paragon Office", area: "Central · lobby reception", rule: { type: "weekdays" }, active: true, sortOrder: 10 },
  { id: "paragon-t", name: "Paragon Office", area: "Tegal · lobby reception", rule: { type: "twin" }, active: true, sortOrder: 20 },
  { id: "telkom", name: "Telkom Landmark Tower", area: "Gatot Subroto · GF concierge", rule: { type: "day", day: 4 }, active: true, sortOrder: 30 },
  { id: "bakery", name: "Self-pickup — Bakery", area: "Kebagusan kitchen", rule: { type: "everyday" }, active: true, sortOrder: 40 },
  { id: "others", name: "Others", area: "Order via Shopee / GrabFood", rule: { type: "external", shopee: "https://shopee.co.id/nobitesleft", grab: "https://food.grab.com/id/nobitesleft" }, active: true, sortOrder: 50 },
];

export interface PickupLocationStore {
  init(): Promise<void>;
  /** All locations incl. inactive (admin). Sorted by sortOrder. */
  list(): Promise<PickupLocation[]>;
  /** Active locations only (storefront). Sorted by sortOrder. */
  listActive(): Promise<PickupLocation[]>;
  get(id: string): Promise<PickupLocation | null>;
  upsert(loc: PickupLocation): Promise<void>;
  remove(id: string): Promise<void>;
  getSettings(): Promise<PickupSettings>;
  setSettings(patch: Partial<PickupSettings>): Promise<PickupSettings>;
}

// ---------------------------------------------------------------- Validation (shared)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate a rule shape (config integrity — README §8). Returns an error or null. */
export function validateRule(rule: unknown): { rule?: PickupRule; error?: string } {
  if (!rule || typeof rule !== "object") return { error: "rule is required" };
  const r = rule as Record<string, unknown>;
  switch (r.type) {
    case "weekdays":
    case "twin":
    case "everyday":
      return { rule: { type: r.type } as PickupRule };
    case "day": {
      const day = Number(r.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "day rule needs a weekday 0..6" };
      return { rule: { type: "day", day } };
    }
    case "external": {
      const shopee = typeof r.shopee === "string" ? r.shopee.trim() : "";
      const grab = typeof r.grab === "string" ? r.grab.trim() : "";
      if (!shopee && !grab) return { error: "external location needs a Shopee or GrabFood URL" };
      return { rule: { type: "external", ...(shopee ? { shopee } : {}), ...(grab ? { grab } : {}) } };
    }
    default:
      return { error: `unknown rule type: ${String(r.type)}` };
  }
}

function validateSettingsPatch(patch: Partial<PickupSettings>): { error?: string } {
  for (const key of ["sameDayCutoffWib", "openFromWib", "openToWib"] as const) {
    const v = patch[key];
    if (v !== undefined && (typeof v !== "string" || !HHMM.test(v))) {
      return { error: `${key} must be HH:MM (24h)` };
    }
  }
  return {};
}

// ---------------------------------------------------------------- In-code seed store (no DB)
class SeedPickupLocationStore implements PickupLocationStore {
  private locs: PickupLocation[] = SEED_LOCATIONS.map((l) => ({ ...l }));
  private settings: PickupSettings = { ...DEFAULT_PICKUP_SETTINGS };
  async init(): Promise<void> {}
  async list(): Promise<PickupLocation[]> {
    return [...this.locs].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  async listActive(): Promise<PickupLocation[]> {
    return (await this.list()).filter((l) => l.active);
  }
  async get(id: string): Promise<PickupLocation | null> {
    return this.locs.find((l) => l.id === id) ?? null;
  }
  async upsert(loc: PickupLocation): Promise<void> {
    this.locs = [...this.locs.filter((l) => l.id !== loc.id), loc];
  }
  async remove(id: string): Promise<void> {
    this.locs = this.locs.filter((l) => l.id !== id);
  }
  async getSettings(): Promise<PickupSettings> {
    return { ...this.settings };
  }
  async setSettings(patch: Partial<PickupSettings>): Promise<PickupSettings> {
    this.settings = { ...this.settings, ...patch };
    return { ...this.settings };
  }
}

// ---------------------------------------------------------------- Postgres store
class PostgresPickupLocationStore implements PickupLocationStore {
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

  private row(r: Record<string, unknown>): PickupLocation {
    const rawRule = typeof r.rule === "string" ? JSON.parse(r.rule as string) : r.rule;
    return {
      id: r.id as string,
      name: r.name as string,
      area: (r.area as string) ?? "",
      rule: rawRule as PickupRule,
      active: r.active as boolean,
      sortOrder: Number(r.sort_order),
    };
  }

  async init(): Promise<void> {
    const pool = await this.pool();
    // Self-contained: ensure the tables exist (also created by
    // db/pickup-multilocation.sql), then seed once if empty.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pickup_locations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL DEFAULT '',
        rule JSONB NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pickup_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        same_day_cutoff_wib TEXT NOT NULL DEFAULT '17:00',
        open_from_wib TEXT NOT NULL DEFAULT '09:00',
        open_to_wib TEXT NOT NULL DEFAULT '17:00',
        CONSTRAINT pickup_settings_singleton CHECK (id = 1)
      );`);
    await pool.query(`INSERT INTO pickup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    const { rows } = await pool.query("SELECT count(*)::int n FROM pickup_locations");
    if (rows[0].n === 0) {
      for (const l of SEED_LOCATIONS) {
        await pool.query(
          `INSERT INTO pickup_locations (id, name, area, rule, active, sort_order)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [l.id, l.name, l.area, JSON.stringify(l.rule), l.active, l.sortOrder],
        );
      }
    }
  }

  async list(): Promise<PickupLocation[]> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM pickup_locations ORDER BY sort_order, id");
    return rows.map((r) => this.row(r));
  }
  async listActive(): Promise<PickupLocation[]> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM pickup_locations WHERE active = true ORDER BY sort_order, id");
    return rows.map((r) => this.row(r));
  }
  async get(id: string): Promise<PickupLocation | null> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM pickup_locations WHERE id = $1", [id]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async upsert(l: PickupLocation): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      `INSERT INTO pickup_locations (id, name, area, rule, active, sort_order, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, area = EXCLUDED.area, rule = EXCLUDED.rule,
         active = EXCLUDED.active, sort_order = EXCLUDED.sort_order, updated_at = now()`,
      [l.id, l.name, l.area, JSON.stringify(l.rule), l.active, l.sortOrder],
    );
  }
  async remove(id: string): Promise<void> {
    const pool = await this.pool();
    await pool.query("DELETE FROM pickup_locations WHERE id = $1", [id]);
  }
  async getSettings(): Promise<PickupSettings> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM pickup_settings WHERE id = 1");
    const r = rows[0];
    if (!r) return { ...DEFAULT_PICKUP_SETTINGS };
    return {
      sameDayCutoffWib: (r.same_day_cutoff_wib as string) ?? DEFAULT_PICKUP_SETTINGS.sameDayCutoffWib,
      openFromWib: (r.open_from_wib as string) ?? DEFAULT_PICKUP_SETTINGS.openFromWib,
      openToWib: (r.open_to_wib as string) ?? DEFAULT_PICKUP_SETTINGS.openToWib,
    };
  }
  async setSettings(patch: Partial<PickupSettings>): Promise<PickupSettings> {
    const pool = await this.pool();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (patch.sameDayCutoffWib !== undefined) { sets.push(`same_day_cutoff_wib = $${i++}`); vals.push(patch.sameDayCutoffWib); }
    if (patch.openFromWib !== undefined) { sets.push(`open_from_wib = $${i++}`); vals.push(patch.openFromWib); }
    if (patch.openToWib !== undefined) { sets.push(`open_to_wib = $${i++}`); vals.push(patch.openToWib); }
    if (sets.length > 0) {
      await pool.query(`UPDATE pickup_settings SET ${sets.join(", ")} WHERE id = 1`, vals);
    }
    return this.getSettings();
  }
}

let _store: PickupLocationStore | null = null;
export function getPickupLocationStore(): PickupLocationStore {
  if (_store) return _store;
  _store = env.databaseUrl ? new PostgresPickupLocationStore() : new SeedPickupLocationStore();
  return _store;
}

export { validateSettingsPatch };
