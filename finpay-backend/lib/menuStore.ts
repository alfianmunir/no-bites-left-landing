/**
 * DB-driven menu (Phase 1). One row per SKU (denormalized family fields) so new
 * items can be added straight in the DB. Mirrors lib/db.ts's Postgres-or-file
 * pattern; the table auto-seeds from CATALOG on first init if empty, so orders
 * keep working even before anyone touches the DB.
 *
 * SECURITY: this is the server-side price source of truth for POST /api/orders —
 * amounts are always recomputed from here, never from the client.
 */
import { env } from "./env";

export interface MenuItem {
  sku: string;
  family: string;
  name: string;
  variant: string | null;
  unitPrice: number | null; // integer IDR; null for coming-soon
  image: string;
  accent: string;
  tag: string | null;
  tagId: string | null;
  note: string | null;
  noteId: string | null;
  description: string | null;
  descriptionId: string | null;
  available: boolean; // false = "coming soon" (not orderable)
  sortOrder: number;
}

// Canonical seed — the current catalog (prices.ts + landing families + i18n).
// Editing/adding rows in the DB overrides this after seeding.
type FamilySeed = {
  family: string; name: string; image: string; accent: string; sortOrder: number;
  tag?: string; tagId?: string; note: string; noteId: string; description: string; descriptionId: string;
  variants?: { sku: string; variant: string; unitPrice: number }[]; // absent = coming soon
};

const FAMILIES: FamilySeed[] = [
  { family: "apple", name: "Apple Pie", image: "/images/menu-apple-c.png", accent: "#e24026", sortOrder: 0,
    tag: "Signature", tagId: "Andalan", note: "Contains spices", noteId: "Mengandung rempah",
    description: "US apples, balanced cinnamon and a whisper of nutmeg in a flaky crust.",
    descriptionId: "Apel US, kayu manis seimbang, dan sedikit pala dalam kulit yang renyah." },
  { family: "og", name: "OG Cookies", image: "/images/menu-og-c.png", accent: "#f58c21", sortOrder: 1,
    tag: "Bestseller", tagId: "Terlaris", note: "Contains nuts", noteId: "Mengandung kacang",
    description: "The original — soft-baked with melty chocolate chunks and toasted walnuts.",
    descriptionId: "Sang original — lembut dengan lelehan cokelat dan walnut panggang.",
    variants: [{ sku: "og-40", variant: "Personal 40g", unitPrice: 20000 }, { sku: "og-100", variant: "Full Max 100g", unitPrice: 48000 }] },
  { family: "choco", name: "Choco Mania", image: "/images/menu-choco-c.png", accent: "#54300b", sortOrder: 2,
    note: "Contains nuts", noteId: "Mengandung kacang",
    description: "Double chocolate. A rich cocoa cookie packed with choco chunks and walnuts.",
    descriptionId: "Double chocolate. Cookie cokelat pekat penuh choco chunks dan walnut.",
    variants: [{ sku: "choco-40", variant: "Personal 40g", unitPrice: 22000 }, { sku: "choco-100", variant: "Full Max 100g", unitPrice: 53000 }] },
  { family: "hazel", name: "Hazel Lover", image: "/images/menu-hazel-c.png", accent: "#7a4a18", sortOrder: 3,
    note: "Contains nuts", noteId: "Mengandung kacang",
    description: "Chocolate cookie with a molten Nutella centre and crunchy walnuts.",
    descriptionId: "Cookie cokelat dengan isian Nutella meleleh dan walnut renyah.",
    variants: [{ sku: "hazel-40", variant: "Personal 40g", unitPrice: 22000 }, { sku: "hazel-100", variant: "Full Max 100g", unitPrice: 53000 }] },
  { family: "matcha", name: "Matcha", image: "/images/menu-matcha-c.png", accent: "#2d9322", sortOrder: 4,
    note: "Contains nuts", noteId: "Mengandung kacang",
    description: "Stone-ground matcha with white chocolate chunks and buttery macadamia.",
    descriptionId: "Matcha pilihan dengan white chocolate dan macadamia gurih.",
    variants: [{ sku: "matcha-40", variant: "Personal 40g", unitPrice: 25000 }, { sku: "matcha-100", variant: "Full Max 100g", unitPrice: 59000 }] },
  { family: "brownies", name: "Fudgy Brownies Bites", image: "/images/menu-choco-c.png", accent: "#241504", sortOrder: 5,
    note: "10 bites · rich", noteId: "10 bites · pekat",
    description: "Smooth, soft and intensely fudgy — deep chocolate in every single bite.",
    descriptionId: "Lembut, halus, dan sangat fudgy — cokelat pekat di setiap gigitan." },
];

function flatten(f: FamilySeed): MenuItem[] {
  const base = {
    family: f.family, name: f.name, image: f.image, accent: f.accent,
    tag: f.tag ?? null, tagId: f.tagId ?? null, note: f.note, noteId: f.noteId,
    description: f.description, descriptionId: f.descriptionId,
  };
  // sort_order = family*10 + variantIndex, so families stay grouped AND the
  // first (e.g. 40g "most-ordered") variant sorts before the larger one.
  if (!f.variants) {
    return [{ ...base, sku: f.family, variant: null, unitPrice: null, available: false, sortOrder: f.sortOrder * 10 }];
  }
  return f.variants.map((v, i) => ({ ...base, sku: v.sku, variant: v.variant, unitPrice: v.unitPrice, available: true, sortOrder: f.sortOrder * 10 + i }));
}

export const CATALOG: MenuItem[] = FAMILIES.flatMap(flatten);

export interface MenuStore {
  init(): Promise<void>;
  list(): Promise<MenuItem[]>;
  get(sku: string): Promise<MenuItem | null>;
  /** Create or fully replace one menu item (admin CRUD). Keyed on sku. */
  upsert(item: MenuItem): Promise<void>;
  remove(sku: string): Promise<void>;
}

// ---------------------------------------------------------------- In-code store (no DB)
// Writes are in-memory only (dev preview) — they don't survive a restart.
class SeedMenuStore implements MenuStore {
  private items: MenuItem[] = [...CATALOG];
  async init(): Promise<void> {}
  async list(): Promise<MenuItem[]> {
    return [...this.items].sort((a, b) => a.sortOrder - b.sortOrder || a.sku.localeCompare(b.sku));
  }
  async get(sku: string): Promise<MenuItem | null> {
    return this.items.find((m) => m.sku === sku) ?? null;
  }
  async upsert(item: MenuItem): Promise<void> {
    this.items = [...this.items.filter((m) => m.sku !== item.sku), item];
  }
  async remove(sku: string): Promise<void> {
    this.items = this.items.filter((m) => m.sku !== sku);
  }
}

// ---------------------------------------------------------------- Postgres store
class PostgresMenuStore implements MenuStore {
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
  private row(r: Record<string, unknown>): MenuItem {
    return {
      sku: r.sku as string, family: r.family as string, name: r.name as string,
      variant: (r.variant as string) ?? null, unitPrice: r.unit_price == null ? null : Number(r.unit_price),
      image: r.image as string, accent: r.accent as string,
      tag: (r.tag as string) ?? null, tagId: (r.tag_id as string) ?? null,
      note: (r.note as string) ?? null, noteId: (r.note_id as string) ?? null,
      description: (r.description as string) ?? null, descriptionId: (r.description_id as string) ?? null,
      available: r.available as boolean, sortOrder: Number(r.sort_order),
    };
  }
  async init(): Promise<void> {
    const pool = await this.pool();
    // Self-contained: ensure the table exists (also created by db/schema.sql),
    // then seed once if empty.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        sku TEXT PRIMARY KEY, family TEXT NOT NULL, name TEXT NOT NULL, variant TEXT,
        unit_price INTEGER, image TEXT NOT NULL, accent TEXT NOT NULL,
        tag TEXT, tag_id TEXT, note TEXT, note_id TEXT, description TEXT, description_id TEXT,
        available BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0
      );`);
    const { rows } = await pool.query("SELECT count(*)::int n FROM menu_items");
    if (rows[0].n === 0) {
      for (const m of CATALOG) {
        await pool.query(
          `INSERT INTO menu_items (sku, family, name, variant, unit_price, image, accent, tag, tag_id, note, note_id, description, description_id, available, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (sku) DO NOTHING`,
          [m.sku, m.family, m.name, m.variant, m.unitPrice, m.image, m.accent, m.tag, m.tagId, m.note, m.noteId, m.description, m.descriptionId, m.available, m.sortOrder],
        );
      }
    }
  }
  async list(): Promise<MenuItem[]> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM menu_items ORDER BY sort_order, sku");
    return rows.map((r) => this.row(r));
  }
  async get(sku: string): Promise<MenuItem | null> {
    const pool = await this.pool();
    const { rows } = await pool.query("SELECT * FROM menu_items WHERE sku = $1", [sku]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async upsert(m: MenuItem): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      `INSERT INTO menu_items (sku, family, name, variant, unit_price, image, accent, tag, tag_id, note, note_id, description, description_id, available, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (sku) DO UPDATE SET
         family = EXCLUDED.family, name = EXCLUDED.name, variant = EXCLUDED.variant,
         unit_price = EXCLUDED.unit_price, image = EXCLUDED.image, accent = EXCLUDED.accent,
         tag = EXCLUDED.tag, tag_id = EXCLUDED.tag_id, note = EXCLUDED.note, note_id = EXCLUDED.note_id,
         description = EXCLUDED.description, description_id = EXCLUDED.description_id,
         available = EXCLUDED.available, sort_order = EXCLUDED.sort_order`,
      [m.sku, m.family, m.name, m.variant, m.unitPrice, m.image, m.accent, m.tag, m.tagId, m.note, m.noteId, m.description, m.descriptionId, m.available, m.sortOrder],
    );
  }
  async remove(sku: string): Promise<void> {
    const pool = await this.pool();
    await pool.query("DELETE FROM menu_items WHERE sku = $1", [sku]);
  }
}

let _store: MenuStore | null = null;
export function getMenuStore(): MenuStore {
  if (_store) return _store;
  _store = env.databaseUrl ? new PostgresMenuStore() : new SeedMenuStore();
  return _store;
}
