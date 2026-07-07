/**
 * Ops ERP data layer (PRD "NBL Ops ERP" — Phase 1 inventory).
 *
 * The `ops` schema (suppliers, items, purchases, stock ledger, RPCs) lives in
 * the same Supabase project as the storefront but is service-role-only: RLS is
 * on with no policies, so the anon/authenticated clients can't touch it. We
 * reach it through the privileged pooler role in `DATABASE_URL` (raw `pg`,
 * matching lib/db.ts) — never the browser Supabase client.
 *
 * Business rules enforced here (HANDOFF §2):
 *  - Ledgers are append-only. All stock changes go through the RPCs
 *    (receive_purchase / consume_fefo / post_waste / post_opname), never raw
 *    UPDATE/DELETE on stock_moves.
 *  - No typed money totals. Costs come from the ledger + moving-average cost;
 *    the client only ever displays what the server computed.
 *
 * Server-only module.
 */
import { env } from "./env";
import { DEFAULT_PRICING_CONFIG, type PricingConfig } from "./opsPricing";

/** Ops screens need the real database — there is no file-store fallback. */
export const opsEnabled = Boolean(env.databaseUrl);

// --- Row shapes (numeric columns arrive as strings from pg; we coerce) -------

export interface StockBalanceRow {
  itemId: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  avgCost: number;
  stockValue: number;
  reorderPoint: number | null;
  belowReorder: boolean;
}

export interface ReorderAlertRow {
  itemId: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  reorderPoint: number;
}

export interface ExpiringLotRow {
  lotId: string;
  item: string;
  qtyRemaining: number;
  expiryDate: string;
  daysLeft: number;
}

export interface WasteRow {
  name: string;
  qtyWasted: number;
  wasteValue: number;
}

export interface ItemRow {
  id: string;
  name: string;
  type: "ingredient" | "packaging";
  unit: string;
  avgCost: number;
  reorderPoint: number | null;
}

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  stdCost: number;
}

export interface SupplierRow {
  id: string;
  name: string;
}

export interface PricingProductRow {
  id: string;
  sku: string;
  name: string;
  isBundle: boolean;
  stdCost: number;
  listPrice: number;
}

export interface RecipeRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  batchYieldQty: number;
}

export interface RequirementRow {
  name: string;
  unit: string;
  need: number;
  onHand: number;
  short: number; // max(0, need - onHand)
}

export interface OpenBatchRow {
  id: string;
  sku: string;
  name: string;
  plannedQty: number;
  disposition: string;
  createdAt: string;
}

export interface BatchHistoryRow {
  id: string;
  sku: string;
  name: string;
  plannedQty: number;
  actualYield: number;
  yieldPct: number; // actual / planned
  disposition: string;
  bakedAt: string;
  costPerUnit: number;
  laborCost: number;
}

export interface ReceiveLineInput {
  itemId: string;
  qty: number;
  unitCost: number;
  expiryDate: string | null;
}

export interface ReceiveResultLine {
  itemId: string;
  name: string;
  qty: number;
  unitCost: number;
  oldAvgCost: number;
  newAvgCost: number;
}

// --- Connection --------------------------------------------------------------

let _poolPromise: Promise<import("pg").Pool> | null = null;

async function pool(): Promise<import("pg").Pool> {
  if (!env.databaseUrl) throw new Error("ops requires DATABASE_URL");
  if (!_poolPromise) {
    _poolPromise = (async () => {
      // Mirror lib/db.ts: `pg` is CJS, and its DATE parser (oid 1082) otherwise
      // shifts calendar dates by the local timezone. Keep dates as raw strings.
      const mod = await import("pg");
      const Pool = mod.Pool ?? (mod.default as typeof mod | undefined)?.Pool;
      const types = mod.types ?? (mod.default as typeof mod | undefined)?.types;
      if (!Pool) throw new Error("pg module did not expose a Pool export");
      types?.setTypeParser(1082, (val: string) => val);
      return new Pool({ connectionString: env.databaseUrl });
    })();
  }
  return _poolPromise;
}

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

// --- Reads -------------------------------------------------------------------

export async function listStockBalance(): Promise<StockBalanceRow[]> {
  const p = await pool();
  // v_stock_balance carries live qty/value; join items for the reorder point so
  // the Stock screen can flag low stock in one pass.
  const { rows } = await p.query(
    `SELECT b.item_id, b.name, b.unit, b.qty_on_hand, b.avg_cost, b.stock_value,
            i.reorder_point
       FROM ops.v_stock_balance b
       JOIN ops.items i ON i.id = b.item_id
      ORDER BY (b.qty_on_hand < COALESCE(i.reorder_point, 0)) DESC, b.name ASC`,
  );
  return rows.map((r) => {
    const qtyOnHand = num(r.qty_on_hand);
    const reorderPoint = r.reorder_point == null ? null : num(r.reorder_point);
    return {
      itemId: r.item_id as string,
      name: r.name as string,
      unit: r.unit as string,
      qtyOnHand,
      avgCost: num(r.avg_cost),
      stockValue: num(r.stock_value),
      reorderPoint,
      belowReorder: reorderPoint != null && qtyOnHand < reorderPoint,
    };
  });
}

export async function listReorderAlerts(): Promise<ReorderAlertRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT item_id, name, unit, qty_on_hand, reorder_point FROM ops.v_reorder_alerts ORDER BY name`,
  );
  return rows.map((r) => ({
    itemId: r.item_id as string,
    name: r.name as string,
    unit: r.unit as string,
    qtyOnHand: num(r.qty_on_hand),
    reorderPoint: num(r.reorder_point),
  }));
}

export async function listExpiringLots(): Promise<ExpiringLotRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT lot_id, item, qty_remaining, expiry_date, days_left FROM ops.v_expiring_lots ORDER BY days_left ASC`,
  );
  return rows.map((r) => ({
    lotId: r.lot_id as string,
    item: r.item as string,
    qtyRemaining: num(r.qty_remaining),
    expiryDate: r.expiry_date as string,
    daysLeft: num(r.days_left),
  }));
}

export async function listWaste30d(): Promise<WasteRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT name, qty_wasted, waste_value FROM ops.v_waste_30d ORDER BY waste_value DESC`,
  );
  return rows.map((r) => ({
    name: r.name as string,
    qtyWasted: num(r.qty_wasted),
    wasteValue: num(r.waste_value),
  }));
}

export async function listItems(): Promise<ItemRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, name, type, unit, avg_cost, reorder_point FROM ops.items WHERE active ORDER BY type, name`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as "ingredient" | "packaging",
    unit: r.unit as string,
    avgCost: num(r.avg_cost),
    reorderPoint: r.reorder_point == null ? null : num(r.reorder_point),
  }));
}

export async function listProducts(): Promise<ProductRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, sku, name, std_cost FROM ops.products WHERE active ORDER BY sku`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    stdCost: num(r.std_cost),
  }));
}

export async function listSuppliers(): Promise<SupplierRow[]> {
  const p = await pool();
  const { rows } = await p.query(`SELECT id, name FROM ops.suppliers ORDER BY name`);
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

/** Pricing config from ops.config (jsonb key/value); falls back to the seeded
 *  defaults for any key not yet present. */
export async function getPricingConfig(): Promise<PricingConfig> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT key, value FROM ops.config WHERE key = ANY($1::text[])`,
    [["waste_rate", "margin_floor", "bundle_margin_floor", "b2b_margin"]],
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.key as string, Number(r.value));
  return {
    wasteRate: map.get("waste_rate") ?? DEFAULT_PRICING_CONFIG.wasteRate,
    marginFloor: map.get("margin_floor") ?? DEFAULT_PRICING_CONFIG.marginFloor,
    bundleMarginFloor: map.get("bundle_margin_floor") ?? DEFAULT_PRICING_CONFIG.bundleMarginFloor,
    b2bMargin: map.get("b2b_margin") ?? DEFAULT_PRICING_CONFIG.b2bMargin,
  };
}

/** Products with the cost + price inputs the margin math needs. std_cost is the
 *  ledger-derived cost (moving-average receipts + batch costing keep it live). */
export async function listPricingProducts(): Promise<PricingProductRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, sku, name, is_bundle, std_cost, list_price FROM ops.products WHERE active ORDER BY is_bundle, sku`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    isBundle: Boolean(r.is_bundle),
    stdCost: num(r.std_cost),
    listPrice: num(r.list_price),
  }));
}

/** Persist a new list price for a product (the actual "price adjustment").
 *  Margins recompute from this on next read — no stored margin to drift. */
export async function updateProductPrice(productId: string, listPrice: number): Promise<PricingProductRow | null> {
  const p = await pool();
  const { rows } = await p.query(
    `UPDATE ops.products SET list_price = $2 WHERE id = $1 AND active
       RETURNING id, sku, name, is_bundle, std_cost, list_price`,
    [productId, listPrice],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    isBundle: Boolean(r.is_bundle),
    stdCost: num(r.std_cost),
    listPrice: num(r.list_price),
  };
}

// --- Writes (all go through the append-only RPCs) ----------------------------

/**
 * Receive a purchase in one atomic transaction: create the purchase + lines,
 * then call ops.receive_purchase (creates FEFO lots, posts +stock_moves, rolls
 * the moving-average cost). Returns per-item avg-cost before/after so the UI
 * can show the cost impact (HANDOFF §3.2).
 */
export async function receivePurchase(input: {
  supplierId: string | null;
  supplierName: string | null;
  invoiceRef: string | null;
  orderedAt: string | null;
  lines: ReceiveLineInput[];
}): Promise<{ purchaseId: string; lines: ReceiveResultLine[] }> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");

    // Resolve supplier: an existing id, a new name, or none.
    let supplierId = input.supplierId;
    if (!supplierId && input.supplierName && input.supplierName.trim()) {
      const s = await client.query(
        `INSERT INTO ops.suppliers (name) VALUES ($1) RETURNING id`,
        [input.supplierName.trim()],
      );
      supplierId = s.rows[0].id as string;
    }

    const itemIds = input.lines.map((l) => l.itemId);
    const meta = await client.query(
      `SELECT id, name, avg_cost FROM ops.items WHERE id = ANY($1::uuid[])`,
      [itemIds],
    );
    const nameById = new Map<string, string>();
    const oldAvgById = new Map<string, number>();
    for (const r of meta.rows) {
      nameById.set(r.id as string, r.name as string);
      oldAvgById.set(r.id as string, num(r.avg_cost));
    }

    const purchase = await client.query(
      `INSERT INTO ops.purchases (supplier_id, status, invoice_ref, ordered_at)
       VALUES ($1, 'ordered', $2, $3) RETURNING id`,
      [supplierId, input.invoiceRef?.trim() || null, input.orderedAt || null],
    );
    const purchaseId = purchase.rows[0].id as string;

    for (const l of input.lines) {
      await client.query(
        `INSERT INTO ops.purchase_lines (purchase_id, item_id, qty, unit_cost, expiry_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [purchaseId, l.itemId, l.qty, l.unitCost, l.expiryDate || null],
      );
    }

    await client.query(`SELECT ops.receive_purchase($1)`, [purchaseId]);

    const after = await client.query(
      `SELECT id, avg_cost FROM ops.items WHERE id = ANY($1::uuid[])`,
      [itemIds],
    );
    const newAvgById = new Map<string, number>();
    for (const r of after.rows) newAvgById.set(r.id as string, num(r.avg_cost));

    await client.query("COMMIT");

    const lines: ReceiveResultLine[] = input.lines.map((l) => ({
      itemId: l.itemId,
      name: nameById.get(l.itemId) ?? l.itemId,
      qty: l.qty,
      unitCost: l.unitCost,
      oldAvgCost: oldAvgById.get(l.itemId) ?? 0,
      newAvgCost: newAvgById.get(l.itemId) ?? 0,
    }));
    return { purchaseId, lines };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Stock opname: posts the counted-vs-system variance as an opname_adj move. Returns the diff (counted − system). */
export async function postOpname(itemId: string, countedQty: number, note: string | null): Promise<number> {
  const p = await pool();
  const { rows } = await p.query(`SELECT ops.post_opname($1, $2, $3) AS variance`, [itemId, countedQty, note || null]);
  return num(rows[0].variance);
}

/** Ingredient/packaging waste (post_waste, drains lots FEFO at avg cost). Returns cost of wasted stock. */
export async function postWaste(itemId: string, qty: number, note: string | null): Promise<number> {
  const p = await pool();
  const { rows } = await p.query(`SELECT ops.post_waste($1, $2, $3) AS cost`, [itemId, qty, note || null]);
  return num(rows[0].cost);
}

/** Finished-goods waste (post_product_waste, at std_cost). Returns void. */
export async function postProductWaste(productId: string, qty: number, note: string | null): Promise<void> {
  const p = await pool();
  await p.query(`SELECT ops.post_product_waste($1, $2, $3)`, [productId, qty, note || null]);
}

// --- M2 Production & costing --------------------------------------------------

export async function listRecipes(): Promise<RecipeRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT r.id, r.product_id, pr.sku, pr.name, r.batch_yield_qty
       FROM ops.recipes r JOIN ops.products pr ON pr.id = r.product_id
      WHERE r.active AND pr.active ORDER BY pr.sku`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    productId: r.product_id as string,
    sku: r.sku as string,
    name: r.name as string,
    batchYieldQty: num(r.batch_yield_qty),
  }));
}

/** Scaled BOM vs current stock for a planned qty — the pre-start availability
 *  check (F2 "shortfall … blocks plan confirmation"). */
export async function getRecipeRequirements(recipeId: string, plannedQty: number): Promise<RequirementRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT i.name, i.unit,
            round(rl.qty_per_batch * ($2::numeric / r.batch_yield_qty), 4) AS need,
            COALESCE(b.qty_on_hand, 0) AS on_hand
       FROM ops.recipe_lines rl
       JOIN ops.recipes r ON r.id = rl.recipe_id
       JOIN ops.items i ON i.id = rl.item_id
       LEFT JOIN ops.v_stock_balance b ON b.item_id = i.id
      WHERE rl.recipe_id = $1
      ORDER BY i.name`,
    [recipeId, plannedQty],
  );
  return rows.map((r) => {
    const need = num(r.need);
    const onHand = num(r.on_hand);
    return { name: r.name as string, unit: r.unit as string, need, onHand, short: Math.max(0, need - onHand) };
  });
}

export async function listOpenBatches(): Promise<OpenBatchRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pb.id, pr.sku, pr.name, pb.planned_qty, pb.disposition, pb.created_at
       FROM ops.production_batches pb
       JOIN ops.recipes r ON r.id = pb.recipe_id
       JOIN ops.products pr ON pr.id = r.product_id
      WHERE pb.status = 'in_progress'
      ORDER BY pb.created_at ASC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    plannedQty: num(r.planned_qty),
    disposition: r.disposition as string,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function listBatchHistory(limit = 40): Promise<BatchHistoryRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pb.id, pr.sku, pr.name, pb.planned_qty, pb.actual_yield, pb.disposition, pb.baked_at,
            bc.cost_per_unit, bc.labor_cost
       FROM ops.production_batches pb
       JOIN ops.recipes r ON r.id = pb.recipe_id
       JOIN ops.products pr ON pr.id = r.product_id
       LEFT JOIN ops.batch_costs bc ON bc.batch_id = pb.id
      WHERE pb.status = 'closed'
      ORDER BY pb.baked_at DESC NULLS LAST, bc.computed_at DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => {
    const planned = num(r.planned_qty);
    const actual = num(r.actual_yield);
    return {
      id: r.id as string,
      sku: r.sku as string,
      name: r.name as string,
      plannedQty: planned,
      actualYield: actual,
      yieldPct: planned > 0 ? actual / planned : 0,
      disposition: r.disposition as string,
      bakedAt: (r.baked_at as string) ?? "",
      costPerUnit: num(r.cost_per_unit),
      laborCost: num(r.labor_cost),
    };
  });
}

/** Open a batch — consumes the scaled BOM via ops.start_batch. Returns batch id. */
export async function startBatch(recipeId: string, plannedQty: number, disposition: string): Promise<string> {
  const p = await pool();
  const { rows } = await p.query(`SELECT ops.start_batch($1, $2, $3) AS batch`, [recipeId, plannedQty, disposition]);
  return rows[0].batch as string;
}

/** Close a batch — computes cost, posts finished goods, rolls std_cost. Returns cost/unit. */
export async function closeBatch(
  batchId: string,
  actualYield: number,
  laborMinutes: number | null,
  laborCost: number,
): Promise<number> {
  const p = await pool();
  const { rows } = await p.query(`SELECT ops.close_batch($1, $2, $3, $4) AS cpu`, [batchId, actualYield, laborMinutes, laborCost]);
  return num(rows[0].cpu);
}
