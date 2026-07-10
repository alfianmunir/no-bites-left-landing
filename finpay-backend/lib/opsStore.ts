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
import { assemblePnL, monthlyDepreciation, type PnL } from "./opsFinance";
import { hashPassword, verifyPassword } from "./password";

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
  wasteRate: number | null; // per-product override; null = inherit general
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

// --- M2b Production cycles (multi-recipe batches) ---------------------------

/** One recipe in a batch draft, as the client sends it to start_batch_cycle. */
export interface BatchLineInput {
  recipeId: string;
  plannedQty: number;
  qtySample: number;
  qtyKol: number;
  qtyRnd: number;
}

/** A line inside an open/closed cycle (with its cost breakdown once closed). */
export interface BatchLineRow {
  id: string;
  recipeId: string;
  sku: string;
  name: string;
  plannedQty: number;
  qtySample: number;
  qtyKol: number;
  qtyRnd: number;
  actualYield: number | null;
  costPerUnit: number | null;
}

export interface OpenBatchCycleRow {
  id: string;
  createdAt: string;
  laborCost: number | null; // null = opened without labor (staff-started); set at close
  startedByName: string | null; // null = super-admin
  lines: BatchLineRow[];
}

export interface BatchCycleHistoryRow {
  id: string;
  bakedAt: string;
  laborCost: number;
  lines: BatchLineRow[];
}

export interface ChannelRow {
  id: string;
  name: string;
  feePct: number;
  feeFlat: number;
  settlementLagDays: number;
  priceMultiplier: number;
}

export interface SalesLineInput {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface SalesOrderItem {
  sku: string;
  name: string;
  qty: number;
}

export interface SalesOrderRow {
  id: string;
  channel: string;
  customerRef: string | null;
  status: string;
  fulfillmentStatus: string; // preparing | packed | in_delivery | delivered
  paymentStatus: string; // unpaid | paid
  orderedAt: string;
  gross: number;
  cogs: number;
  feePct: number;
  feeFlat: number;
  units: number;
  items: SalesOrderItem[];
  invoiceStatus: string | null;
  invoiceDueDate: string | null;
  pickupDate: string | null; // website orders: storefront pickup date
  sourceOrderId: string | null; // website order id (public.orders) if from the storefront
}

/** A product's total quantity across all orders still in "preparing" — the
 *  kitchen prep list (what to bake/pack next). */
export interface PrepItemRow {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  orders: number;
}

export interface InvoiceRow {
  id: string;
  number: string | null;
  salesOrderId: string;
  channel: string;
  customerRef: string | null;
  issuedAt: string;
  dueDate: string | null;
  status: string;
  amount: number;
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
function mapPricingProduct(r: Record<string, unknown>): PricingProductRow {
  return {
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    isBundle: Boolean(r.is_bundle),
    stdCost: num(r.std_cost),
    listPrice: num(r.list_price),
    wasteRate: r.waste_rate == null ? null : num(r.waste_rate),
  };
}

export async function listPricingProducts(): Promise<PricingProductRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, sku, name, is_bundle, std_cost, list_price, waste_rate FROM ops.products WHERE active ORDER BY is_bundle, sku`,
  );
  return rows.map(mapPricingProduct);
}

/** Persist a new list price for a product (the actual "price adjustment").
 *  Margins recompute from this on next read — no stored margin to drift. */
export async function updateProductPrice(productId: string, listPrice: number): Promise<PricingProductRow | null> {
  const p = await pool();
  const { rows } = await p.query(
    `UPDATE ops.products SET list_price = $2 WHERE id = $1 AND active
       RETURNING id, sku, name, is_bundle, std_cost, list_price, waste_rate`,
    [productId, listPrice],
  );
  return rows[0] ? mapPricingProduct(rows[0]) : null;
}

/** Set (or clear, with null) a product's per-menu waste-rate override. */
export async function updateProductWasteRate(productId: string, wasteRate: number | null): Promise<PricingProductRow | null> {
  const p = await pool();
  const { rows } = await p.query(
    `UPDATE ops.products SET waste_rate = $2 WHERE id = $1 AND active
       RETURNING id, sku, name, is_bundle, std_cost, list_price, waste_rate`,
    [productId, wasteRate],
  );
  return rows[0] ? mapPricingProduct(rows[0]) : null;
}

// --- Website → ops menu mapping (Phase 8) ------------------------------------

export interface MenuMapRow {
  menuSku: string;
  menuName: string;
  menuVariant: string | null;
  available: boolean;
  productId: string | null; // null = not yet mapped
  productName: string | null;
  productSku: string | null;
  qtyPer: number;
}

/** Every storefront menu item with its ops-product mapping (if set). Left join
 *  so unmapped items still show for the admin to link. */
export async function listMenuMap(): Promise<MenuMapRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT mi.sku, mi.name, mi.variant, mi.available,
            m.product_id, m.qty_per, pr.name AS product_name, pr.sku AS product_sku
       FROM public.menu_items mi
       LEFT JOIN ops.menu_product_map m ON m.menu_sku = mi.sku
       LEFT JOIN ops.products pr ON pr.id = m.product_id
      ORDER BY mi.sort_order, mi.sku`,
  );
  return rows.map((r) => ({
    menuSku: r.sku as string,
    menuName: r.name as string,
    menuVariant: (r.variant as string) ?? null,
    available: Boolean(r.available),
    productId: (r.product_id as string) ?? null,
    productName: (r.product_name as string) ?? null,
    productSku: (r.product_sku as string) ?? null,
    qtyPer: r.qty_per == null ? 1 : num(r.qty_per),
  }));
}

/** Link a storefront SKU to an ops product (+ qty multiplier), or clear it
 *  (productId null → remove the mapping). */
export async function setMenuMap(menuSku: string, productId: string | null, qtyPer: number): Promise<void> {
  const p = await pool();
  if (!productId) {
    await p.query(`DELETE FROM ops.menu_product_map WHERE menu_sku = $1`, [menuSku]);
    return;
  }
  await p.query(
    `INSERT INTO ops.menu_product_map (menu_sku, product_id, qty_per, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (menu_sku) DO UPDATE SET product_id = EXCLUDED.product_id, qty_per = EXCLUDED.qty_per, updated_at = now()`,
    [menuSku, productId, qtyPer],
  );
}

/**
 * SKUs that appear on paid-or-beyond website orders but have no menu_product_map
 * row yet — i.e. the orders whose COGS/stock the finance sync can't book until an
 * admin links them, so their COGS/stock can't post. Powers the "needs mapping"
 * banner on the Orders command center. Empty = every live website SKU is mapped.
 */
export async function listUnmappedWebsiteSkus(): Promise<string[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT DISTINCT elem->>'sku' AS sku
       FROM ops.sales_orders so
       JOIN ops.channels c ON c.id = so.channel_id,
            jsonb_array_elements(COALESCE(so.items, '[]'::jsonb)) elem
      WHERE c.name = 'website' AND so.order_no IS NOT NULL AND so.payment_status = 'paid'
        AND COALESCE(elem->>'sku', '') <> ''
        AND NOT EXISTS (SELECT 1 FROM ops.menu_product_map m WHERE m.menu_sku = elem->>'sku')
      ORDER BY 1`,
  );
  return rows.map((r) => r.sku as string);
}

/** Set the general (default) waste rate in ops.config. */
export async function setGeneralWasteRate(wasteRate: number): Promise<void> {
  const p = await pool();
  await p.query(
    `INSERT INTO ops.config (key, value, updated_at) VALUES ('waste_rate', to_jsonb($1::numeric), now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [wasteRate],
  );
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

export type OpnameCategory = "surplus" | "loss" | "equal";

export interface OpnameAdjRow {
  id: string;
  name: string;
  unit: string;
  qty: number; // signed: + surplus, − loss, 0 equal
  unitCost: number;
  value: number; // qty * unitCost (signed)
  category: OpnameCategory;
  note: string | null;
  at: string;
}

/** All opname adjustments (surplus / loss / equal), newest first. Reads the
 *  opname_adj moves tagged ref_type='opname' (excludes batch-cancel reversals,
 *  which reuse the opname_adj reason). qty>0 surplus, <0 loss, 0 equal (matched). */
export async function listOpnameAdjustments(limit = 100): Promise<OpnameAdjRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT sm.id, i.name, i.unit, sm.qty, COALESCE(sm.unit_cost, 0) AS unit_cost, sm.note, sm.created_at
       FROM ops.stock_moves sm
       JOIN ops.items i ON i.id = sm.item_id
      WHERE sm.reason = 'opname_adj' AND sm.ref_type = 'opname'
        AND sm.created_at >= COALESCE(
              (SELECT (value #>> '{}')::timestamptz FROM ops.config WHERE key = 'opname_since'),
              '-infinity'::timestamptz)
      ORDER BY sm.created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => {
    const qty = num(r.qty);
    const unitCost = num(r.unit_cost);
    const category: OpnameCategory = qty > 0 ? "surplus" : qty < 0 ? "loss" : "equal";
    return {
      id: r.id as string,
      name: r.name as string,
      unit: r.unit as string,
      qty,
      unitCost,
      value: qty * unitCost,
      category,
      note: (r.note as string) ?? null,
      at: new Date(r.created_at as string).toISOString(),
    };
  });
}

/** The opname-counting cutoff (ISO date) — adjustments before this are ignored.
 *  null if unset (then everything counts). */
export async function getOpnameSince(): Promise<string | null> {
  const p = await pool();
  const { rows } = await p.query(`SELECT (value #>> '{}') AS since FROM ops.config WHERE key = 'opname_since'`);
  return rows[0]?.since ? new Date(rows[0].since as string).toISOString().slice(0, 10) : null;
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
      WHERE pb.status = 'in_progress' AND pb.is_cycle = false
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
      WHERE pb.status = 'closed' AND pb.is_cycle = false
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

// --- M2b Production cycles ---------------------------------------------------

/** Start a production cycle — creates the header + lines and consumes every
 *  line's scaled BOM (FEFO) in one transaction. Returns the new batch id. */
export async function startBatchCycle(
  lines: BatchLineInput[],
  laborCost: number | null,
  laborMinutes: number | null,
  createdByStaff: string | null = null,
): Promise<string> {
  const p = await pool();
  const payload = lines.map((l) => ({
    recipe_id: l.recipeId,
    planned_qty: l.plannedQty,
    qty_sample: l.qtySample,
    qty_kol: l.qtyKol,
    qty_rnd: l.qtyRnd,
  }));
  const { rows } = await p.query(`SELECT ops.start_batch_cycle($1::jsonb, $2, $3, $4) AS batch`, [
    JSON.stringify(payload),
    laborCost,
    laborMinutes,
    createdByStaff,
  ]);
  return rows[0].batch as string;
}

/** Close a cycle — applies per-line actual yields, costs each line, posts the
 *  for-sale finished goods and rolls std_cost. laborCost fills in the labor for
 *  batches opened without it (staff-started). Returns the batch's total cost. */
export async function closeBatchCycle(
  batchId: string,
  yields: { lineId: string; actualYield: number }[],
  laborCost: number | null = null,
): Promise<number> {
  const p = await pool();
  const payload = yields.map((y) => ({ line_id: y.lineId, actual_yield: y.actualYield }));
  const { rows } = await p.query(`SELECT ops.close_batch_cycle($1, $2::jsonb, $3) AS total`, [batchId, JSON.stringify(payload), laborCost]);
  return num(rows[0].total);
}

async function loadCycleLines(batchIds: string[]): Promise<Map<string, BatchLineRow[]>> {
  const map = new Map<string, BatchLineRow[]>();
  if (batchIds.length === 0) return map;
  const p = await pool();
  const { rows } = await p.query(
    `SELECT bl.id, bl.batch_id, bl.recipe_id, pr.sku, pr.name, bl.planned_qty,
            bl.qty_sample, bl.qty_kol, bl.qty_rnd, bl.actual_yield, bl.cost_per_unit
       FROM ops.batch_lines bl
       JOIN ops.products pr ON pr.id = bl.product_id
      WHERE bl.batch_id = ANY($1::uuid[])
      ORDER BY bl.created_at ASC`,
    [batchIds],
  );
  for (const r of rows) {
    const line: BatchLineRow = {
      id: r.id as string,
      recipeId: r.recipe_id as string,
      sku: r.sku as string,
      name: r.name as string,
      plannedQty: num(r.planned_qty),
      qtySample: num(r.qty_sample),
      qtyKol: num(r.qty_kol),
      qtyRnd: num(r.qty_rnd),
      actualYield: r.actual_yield == null ? null : num(r.actual_yield),
      costPerUnit: r.cost_per_unit == null ? null : num(r.cost_per_unit),
    };
    const list = map.get(r.batch_id as string);
    if (list) list.push(line);
    else map.set(r.batch_id as string, [line]);
  }
  return map;
}

export async function listOpenBatchCycles(): Promise<OpenBatchCycleRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pb.id, pb.created_at, pb.labor_cost, s.name AS started_by
       FROM ops.production_batches pb
       LEFT JOIN ops.staff s ON s.id = pb.created_by_staff
      WHERE pb.status = 'in_progress' AND pb.is_cycle = true
      ORDER BY pb.created_at ASC`,
  );
  const lines = await loadCycleLines(rows.map((r) => r.id as string));
  return rows.map((r) => ({
    id: r.id as string,
    createdAt: new Date(r.created_at as string).toISOString(),
    laborCost: r.labor_cost == null ? null : num(r.labor_cost),
    startedByName: (r.started_by as string) ?? null,
    lines: lines.get(r.id as string) ?? [],
  }));
}

export async function listBatchCycleHistory(limit = 20): Promise<BatchCycleHistoryRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pb.id, pb.baked_at, COALESCE(pb.labor_cost, 0) AS labor_cost
       FROM ops.production_batches pb
      WHERE pb.status = 'closed' AND pb.is_cycle = true
      ORDER BY pb.baked_at DESC NULLS LAST, pb.created_at DESC
      LIMIT $1`,
    [limit],
  );
  const lines = await loadCycleLines(rows.map((r) => r.id as string));
  return rows.map((r) => ({
    id: r.id as string,
    bakedAt: (r.baked_at as string) ?? "",
    laborCost: num(r.labor_cost),
    lines: lines.get(r.id as string) ?? [],
  }));
}

// --- M3 OMS (channel unification) --------------------------------------------

export async function listChannels(): Promise<ChannelRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, name, fee_pct, fee_flat, settlement_lag_days, price_multiplier
       FROM ops.channels WHERE active ORDER BY (name='direct') DESC, (name='b2b') DESC, name`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    feePct: num(r.fee_pct),
    feeFlat: num(r.fee_flat),
    settlementLagDays: num(r.settlement_lag_days),
    priceMultiplier: num(r.price_multiplier),
  }));
}

/**
 * Record a manual channel order (WA/Direct/GoFood/B2B). One transaction:
 * sales_orders + sales_lines (each snapshotting the product's current std_cost
 * as unit_cogs, so margin is frozen at sale time). For a B2B channel an invoice
 * is raised (due = ordered + settlement_lag_days) for AR aging.
 */
export async function createSalesOrder(input: {
  channelId: string;
  customerRef: string | null;
  orderedAt: string | null;
  source: string | null;
  lines: SalesLineInput[];
}): Promise<{ salesOrderId: string; invoiceId: string | null }> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const ch = await client.query(
      `SELECT name, fee_pct, fee_flat, settlement_lag_days FROM ops.channels WHERE id = $1 AND active`,
      [input.channelId],
    );
    if (!ch.rows[0]) throw new Error("channel not found or inactive");
    const channelName = ch.rows[0].name as string;
    const feePct = num(ch.rows[0].fee_pct);
    const feeFlat = num(ch.rows[0].fee_flat);
    const lagDays = num(ch.rows[0].settlement_lag_days);

    // Fulfillment + payment start states by channel. Canteen is an internal
    // cash sale, born delivered + paid. Cash-settling channels (direct,
    // marketplaces) are paid at sale; b2b (invoice) and website (PG webhook)
    // start unpaid.
    const bornDelivered = channelName === "canteen";
    const paidAtSale = channelName !== "b2b" && channelName !== "website";
    const fulfillmentStatus = bornDelivered ? "delivered" : "preparing";
    const paymentStatus = paidAtSale ? "paid" : "unpaid";

    const so = await client.query(
      `INSERT INTO ops.sales_orders (channel_id, customer_ref, source_order_id, ordered_at, fulfillment_status, payment_status, fulfilled_at)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5, $6, CASE WHEN $7 THEN now() ELSE NULL END) RETURNING id`,
      [input.channelId, input.customerRef?.trim() || null, input.source?.trim() || null, input.orderedAt || null, fulfillmentStatus, paymentStatus, bornDelivered],
    );
    const salesOrderId = so.rows[0].id as string;

    let gross = 0;
    for (const l of input.lines) {
      // Inventory-driven COGS: value the sale at the product's current
      // finished-goods moving-average cost — the cost it was actually MADE at
      // (production_output posts at that batch's made-cost; sales draw down at
      // the running average). Falls back to std_cost when there's no
      // finished-goods on hand yet (e.g. product never produced through a batch).
      const macQ = await client.query(
        `SELECT CASE WHEN COALESCE(sum(qty), 0) > 0
                     THEN sum(qty * unit_cost) / sum(qty)
                     ELSE (SELECT std_cost FROM ops.products WHERE id = $1) END AS mac
           FROM ops.stock_moves WHERE product_id = $1`,
        [l.productId],
      );
      const madeCost = num(macQ.rows[0]?.mac);
      // Snapshot realized COGS on the line…
      await client.query(
        `INSERT INTO ops.sales_lines (sales_order_id, product_id, qty, unit_price, unit_cogs)
         VALUES ($1, $2, $3, $4, $5)`,
        [salesOrderId, l.productId, l.qty, l.unitPrice, madeCost],
      );
      // …and draw finished goods down at that cost, so COGS ties to the ledger.
      await client.query(
        `INSERT INTO ops.stock_moves (product_id, qty, reason, ref_type, ref_id, unit_cost)
         VALUES ($1, $2, 'sale', 'sales_order', $3, $4)`,
        [l.productId, -l.qty, salesOrderId, madeCost],
      );
      gross += l.unitPrice * l.qty;
    }

    let invoiceId: string | null = null;
    if (channelName === "b2b") {
      const number = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${salesOrderId.slice(0, 4).toUpperCase()}`;
      const inv = await client.query(
        `INSERT INTO ops.invoices (sales_order_id, number, due_date, status, amount)
         VALUES ($1, $2, (COALESCE($3::date, CURRENT_DATE) + $4::int), 'sent', $5) RETURNING id`,
        [salesOrderId, number, input.orderedAt ? input.orderedAt.slice(0, 10) : null, lagDays, gross],
      );
      invoiceId = inv.rows[0].id as string;
    }

    // M4 cash auto-posting (PRD §M4 "money events auto-post"). Immediate-
    // settlement channels post cash IN at order time; marketplaces land the
    // net-of-commission amount in `marketplace_pending` until settlement.
    // B2B has no cash yet (its invoice payment posts it — see setInvoiceStatus);
    // website waits on the deferred PG-webhook trigger, so it's skipped here.
    if (gross > 0 && channelName !== "b2b" && channelName !== "website") {
      const isMarketplace = channelName === "gofood" || channelName === "grabfood" || channelName === "shopeefood";
      const account = isMarketplace ? "marketplace_pending" : "bank";
      const net = gross - (gross * feePct + feeFlat); // customer pays gross; platform keeps its commission
      if (net > 0) {
        await client.query(
          `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, occurred_at, note)
           VALUES ('in', $1, $2, $3, 'sales_order', $4, COALESCE($5::date, CURRENT_DATE), $6)`,
          [net, account, `sales_${channelName}`, salesOrderId, input.orderedAt ? input.orderedAt.slice(0, 10) : null, input.customerRef?.trim() || null],
        );
      }
    }

    await client.query("COMMIT");
    return { salesOrderId, invoiceId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

interface WebsiteChannel {
  id: string;
  feePct: number;
  feeFlat: number;
}

/** The active `website` channel + its gateway-fee terms, or null if inactive. */
async function getWebsiteChannel(p: import("pg").Pool): Promise<WebsiteChannel | null> {
  const ch = await p.query(`SELECT id, fee_pct, fee_flat FROM ops.channels WHERE name = 'website' AND active`);
  if (!ch.rows[0]) return null;
  return { id: ch.rows[0].id as string, feePct: num(ch.rows[0].fee_pct), feeFlat: num(ch.rows[0].fee_flat) };
}

/**
 * Backstop for the real-time webhook (Phase 10). Website orders are now native
 * ops.sales_orders (created unpaid at checkout, flipped to paid + realized by the
 * Finpay webhook). If a webhook's realizeWebsiteOrderPayment ever failed, the
 * order is paid but its ledger effect (sales_lines / stock / cash) is missing —
 * this finds those and realizes them. Idempotent. Run on the ops Orders/Board
 * page load, the way the old public.orders sync used to sweep.
 */
export async function reconcileWebsiteFinance(): Promise<{ realized: number }> {
  const unrealized = await listWebsiteOrderDrift();
  let realized = 0;
  for (const d of unrealized) {
    const r = await realizeWebsiteOrderPayment(d.orderId);
    if (r.realized) realized++;
  }
  return { realized };
}

/**
 * Realize the finance side of a NATIVE website order when it is paid (Phase 10).
 * The order already exists in ops.sales_orders (created unpaid at checkout by the
 * OrderStore); its payment_status is flipped to paid by the webhook via
 * setStatus. This adds the finance effect ONCE: maps each item's SKU via
 * menu_product_map → sales_lines (COGS at made-cost) + a 'sale' stock_move
 * (draws finished goods down), and posts the cash-in NET of the channel fee.
 *
 * Idempotent: no-ops if the order already has sales_lines or a website cash
 * entry (so a duplicate PAID callback can't double-book). RESILIENT: still posts
 * cash even if some/all SKUs are unmapped — those lines are skipped and the order
 * is `flagged` for menu-mapping. Keyed on order_no.
 */
export async function realizeWebsiteOrderPayment(orderNo: string): Promise<{ realized: boolean; flagged: boolean }> {
  const p = await pool();
  const channel = await getWebsiteChannel(p);
  if (!channel) return { realized: false, flagged: false };

  const { rows } = await p.query(
    `SELECT id, items, amount FROM ops.sales_orders WHERE order_no = $1 AND channel_id = $2`,
    [orderNo, channel.id],
  );
  const so = rows[0];
  if (!so) return { realized: false, flagged: false };
  const soId = so.id as string;

  // Idempotency: already realized (has lines or a website cash entry)?
  const done = await p.query(
    `SELECT 1 FROM ops.sales_lines WHERE sales_order_id = $1
     UNION ALL
     SELECT 1 FROM ops.cash_entries WHERE ref_type = 'sales_order' AND ref_id = $1 AND category = 'sales_website'
     LIMIT 1`,
    [soId],
  );
  if (done.rows[0]) return { realized: false, flagged: false };

  const items: Array<{ sku?: string; qty?: number | string; unit_price?: number | string }> = Array.isArray(so.items) ? so.items : [];
  const lines: Array<{ productId: string; qty: number; unitPrice: number }> = [];
  let anyUnmapped = false;
  for (const it of items) {
    const sku = typeof it.sku === "string" ? it.sku : "";
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unit_price) || 0;
    if (!sku || qty <= 0) continue;
    const m = await p.query(`SELECT product_id, qty_per FROM ops.menu_product_map WHERE menu_sku = $1`, [sku]);
    if (!m.rows[0]) { anyUnmapped = true; continue; }
    const qtyPer = num(m.rows[0].qty_per) || 1;
    lines.push({ productId: m.rows[0].product_id as string, qty: qty * qtyPer, unitPrice: qtyPer > 0 ? unitPrice / qtyPer : unitPrice });
  }
  const flagged = anyUnmapped || lines.length === 0;
  const amount = num(so.amount);

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (const l of lines) {
      const macQ = await client.query(
        `SELECT CASE WHEN COALESCE(sum(qty), 0) > 0 THEN sum(qty * unit_cost) / sum(qty)
                     ELSE (SELECT std_cost FROM ops.products WHERE id = $1) END AS mac
           FROM ops.stock_moves WHERE product_id = $1`,
        [l.productId],
      );
      const madeCost = num(macQ.rows[0]?.mac);
      await client.query(
        `INSERT INTO ops.sales_lines (sales_order_id, product_id, qty, unit_price, unit_cogs) VALUES ($1, $2, $3, $4, $5)`,
        [soId, l.productId, l.qty, l.unitPrice, madeCost],
      );
      await client.query(
        `INSERT INTO ops.stock_moves (product_id, qty, reason, ref_type, ref_id, unit_cost) VALUES ($1, $2, 'sale', 'sales_order', $3, $4)`,
        [l.productId, -l.qty, soId, madeCost],
      );
    }
    // Cash-in NET of the channel gateway fee (ties to Finpay's net settlement +
    // the P&L's net revenue).
    const net = amount > 0 ? amount - (amount * channel.feePct + channel.feeFlat) : 0;
    if (net > 0) {
      await client.query(
        `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, occurred_at, note)
         VALUES ('in', $1, 'bank', 'sales_website', 'sales_order', $2, CURRENT_DATE, $3)`,
        [net, soId, orderNo],
      );
    }
    await client.query("COMMIT");
    return { realized: true, flagged };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export interface WebsiteOrderDrift {
  orderId: string;
  status: string;
  amount: number;
  customerName: string;
}

/**
 * PAID native website orders whose finance effect never posted — i.e. no website
 * cash entry exists for them (the webhook's realizeWebsiteOrderPayment failed).
 * Empty in the healthy state; a non-empty result means a paid order's revenue
 * hasn't been booked. Surfaced as a Today alert and swept by
 * reconcileWebsiteFinance(). Keyed on order_no (the consumer NBL number).
 */
export async function listWebsiteOrderDrift(): Promise<WebsiteOrderDrift[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT so.order_no, so.status, so.amount, so.customer_ref
       FROM ops.sales_orders so
       JOIN ops.channels c ON c.id = so.channel_id
      WHERE c.name = 'website' AND so.order_no IS NOT NULL
        AND so.payment_status = 'paid' AND COALESCE(so.amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM ops.cash_entries ce
           WHERE ce.ref_type = 'sales_order' AND ce.ref_id = so.id AND ce.category = 'sales_website'
        )
      ORDER BY so.ordered_at ASC`,
  );
  return rows.map((r) => ({
    orderId: r.order_no as string,
    status: r.status as string,
    amount: num(r.amount),
    customerName: (r.customer_ref as string) ?? "Website",
  }));
}

export async function listSalesOrders(limit = 50): Promise<SalesOrderRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT so.id, c.name AS channel, so.customer_ref, so.status,
            so.fulfillment_status, so.payment_status, so.ordered_at, so.source_order_id,
            c.fee_pct, c.fee_flat,
            COALESCE(sum(sl.unit_price * sl.qty), 0) AS gross,
            COALESCE(sum(sl.unit_cogs * sl.qty), 0) AS cogs,
            COALESCE(sum(sl.qty), 0) AS units,
            inv.status AS invoice_status, inv.due_date AS invoice_due,
            so.pickup_date
       FROM ops.sales_orders so
       JOIN ops.channels c ON c.id = so.channel_id
       LEFT JOIN ops.sales_lines sl ON sl.sales_order_id = so.id
       LEFT JOIN ops.invoices inv ON inv.sales_order_id = so.id
      GROUP BY so.id, c.name, so.customer_ref, so.status, so.fulfillment_status, so.payment_status, so.ordered_at, so.source_order_id, c.fee_pct, c.fee_flat, inv.status, inv.due_date, so.pickup_date
      ORDER BY so.ordered_at DESC
      LIMIT $1`,
    [limit],
  );
  const ids = rows.map((r) => r.id as string);
  const items = await loadOrderItems(ids);
  return rows.map((r) => ({
    id: r.id as string,
    channel: r.channel as string,
    customerRef: (r.customer_ref as string) ?? null,
    status: r.status as string,
    fulfillmentStatus: r.fulfillment_status as string,
    paymentStatus: r.payment_status as string,
    orderedAt: new Date(r.ordered_at as string).toISOString(),
    gross: num(r.gross),
    cogs: num(r.cogs),
    feePct: num(r.fee_pct),
    feeFlat: num(r.fee_flat),
    units: num(r.units),
    items: items.get(r.id as string) ?? [],
    invoiceStatus: (r.invoice_status as string) ?? null,
    invoiceDueDate: (r.invoice_due as string) ?? null,
    pickupDate: r.pickup_date ? new Date(r.pickup_date as string).toISOString().slice(0, 10) : null,
    sourceOrderId: (r.source_order_id as string) ?? null,
  }));
}

async function loadOrderItems(orderIds: string[]): Promise<Map<string, SalesOrderItem[]>> {
  const map = new Map<string, SalesOrderItem[]>();
  if (orderIds.length === 0) return map;
  const p = await pool();
  const { rows } = await p.query(
    `SELECT sl.sales_order_id, pr.sku, pr.name, sl.qty
       FROM ops.sales_lines sl
       JOIN ops.products pr ON pr.id = sl.product_id
      WHERE sl.sales_order_id = ANY($1::uuid[])
      ORDER BY pr.name`,
    [orderIds],
  );
  for (const r of rows) {
    const item: SalesOrderItem = { sku: r.sku as string, name: r.name as string, qty: num(r.qty) };
    const list = map.get(r.sales_order_id as string);
    if (list) list.push(item);
    else map.set(r.sales_order_id as string, [item]);
  }
  return map;
}

/** Set an order's fulfillment and/or payment status. Marking a non-b2b order
 *  paid posts cash IN (idempotent — guarded so it never double-posts; b2b cash
 *  comes from its invoice). Reaching "delivered" stamps fulfilled_at. */
// Apply a state patch to ONE order on an open transaction client. Returns
// false if the order doesn't exist. Shared by single + bulk update.
async function applyOrderState(
  client: import("pg").PoolClient,
  orderId: string,
  patch: { fulfillmentStatus?: string; paymentStatus?: string },
): Promise<boolean> {
  const cur = await client.query(
    `SELECT so.payment_status, c.name AS channel, c.fee_pct, c.fee_flat,
            COALESCE(sum(sl.unit_price * sl.qty), 0) AS gross
       FROM ops.sales_orders so
       JOIN ops.channels c ON c.id = so.channel_id
       LEFT JOIN ops.sales_lines sl ON sl.sales_order_id = so.id
      WHERE so.id = $1
      GROUP BY so.payment_status, c.name, c.fee_pct, c.fee_flat`,
    [orderId],
  );
  if (!cur.rows[0]) return false;
  const row = cur.rows[0];

  if (patch.fulfillmentStatus) {
    await client.query(
      `UPDATE ops.sales_orders
          SET fulfillment_status = $2,
              fulfilled_at = CASE WHEN $2 = 'delivered' AND fulfilled_at IS NULL THEN now()
                                  WHEN $2 <> 'delivered' THEN NULL ELSE fulfilled_at END
        WHERE id = $1`,
      [orderId, patch.fulfillmentStatus],
    );
  }

  if (patch.paymentStatus) {
    await client.query(`UPDATE ops.sales_orders SET payment_status = $2 WHERE id = $1`, [orderId, patch.paymentStatus]);
    // Post cash the first time a non-b2b order turns paid (b2b posts via its
    // invoice). Idempotent: only if no sales cash entry exists for this order.
    if (patch.paymentStatus === "paid" && row.payment_status !== "paid" && row.channel !== "b2b") {
      const gross = num(row.gross);
      const net = gross - (gross * num(row.fee_pct) + num(row.fee_flat));
      const isMarketplace = row.channel === "gofood" || row.channel === "grabfood" || row.channel === "shopeefood";
      const account = isMarketplace ? "marketplace_pending" : "bank";
      if (net > 0) {
        await client.query(
          `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, occurred_at, note)
           SELECT 'in', $1, $2, $3, 'sales_order', $4, CURRENT_DATE, NULL
            WHERE NOT EXISTS (SELECT 1 FROM ops.cash_entries WHERE ref_type = 'sales_order' AND ref_id = $4)`,
          [net, account, `sales_${row.channel}`, orderId],
        );
      }
    }
  }
  return true;
}

export async function updateOrderState(
  orderId: string,
  patch: { fulfillmentStatus?: string; paymentStatus?: string },
): Promise<boolean> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const ok = await applyOrderState(client, orderId, patch);
    await client.query(ok ? "COMMIT" : "ROLLBACK");
    return ok;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Bulk-apply a status/payment patch to many orders in one transaction.
 *  Returns the count updated. Missing ids are skipped. */
export async function updateOrdersState(
  orderIds: string[],
  patch: { fulfillmentStatus?: string; paymentStatus?: string },
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (const id of orderIds) {
      if (await applyOrderState(client, id, patch)) n++;
    }
    await client.query("COMMIT");
    return n;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Kitchen prep list: total qty of each product across all orders still in
 *  "preparing" (excludes cancelled). Drives "what to make next". */
export async function listPreparingItems(): Promise<PrepItemRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pr.id, pr.sku, pr.name,
            COALESCE(sum(sl.qty), 0) AS qty,
            count(DISTINCT so.id)::int AS orders
       FROM ops.sales_orders so
       JOIN ops.sales_lines sl ON sl.sales_order_id = so.id
       JOIN ops.products pr ON pr.id = sl.product_id
      WHERE so.fulfillment_status = 'preparing' AND so.status <> 'cancelled'
      GROUP BY pr.id, pr.sku, pr.name
      ORDER BY qty DESC, pr.name`,
  );
  return rows.map((r) => ({
    productId: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    qty: num(r.qty),
    orders: num(r.orders),
  }));
}

export async function listInvoices(): Promise<InvoiceRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT inv.id, inv.number, inv.sales_order_id, c.name AS channel, so.customer_ref,
            inv.issued_at, inv.due_date, inv.status, inv.amount
       FROM ops.invoices inv
       JOIN ops.sales_orders so ON so.id = inv.sales_order_id
       JOIN ops.channels c ON c.id = so.channel_id
      ORDER BY (inv.status = 'paid') ASC, inv.due_date ASC NULLS LAST`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    number: (r.number as string) ?? null,
    salesOrderId: r.sales_order_id as string,
    channel: r.channel as string,
    customerRef: (r.customer_ref as string) ?? null,
    issuedAt: r.issued_at as string,
    dueDate: (r.due_date as string) ?? null,
    status: r.status as string,
    amount: num(r.amount),
  }));
}

/** Update an invoice's AR status (draft/sent/paid/overdue/void). Invoice status
 *  is mutable AR state (not a ledger); the underlying sales_order is unchanged.
 *  Marking an invoice `paid` is the B2B revenue trigger (PRD §F3) — it posts a
 *  cash IN entry to `bank` once (idempotent on ref_type/ref_id), so re-marking
 *  or a later un-pay never double-books the receipt. */
export async function setInvoiceStatus(invoiceId: string, status: string): Promise<boolean> {
  const allowed = ["draft", "sent", "paid", "overdue", "void"];
  if (!allowed.includes(status)) throw new Error("invalid invoice status");
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const { rowCount, rows } = await client.query(
      `UPDATE ops.invoices SET status = $2 WHERE id = $1 RETURNING amount`,
      [invoiceId, status],
    );
    if ((rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    if (status === "paid") {
      const amount = num(rows[0].amount);
      if (amount > 0) {
        await client.query(
          `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, note)
           SELECT 'in', $2, 'bank', 'sales_b2b', 'invoice', $1, 'B2B invoice paid'
            WHERE NOT EXISTS (
              SELECT 1 FROM ops.cash_entries WHERE ref_type = 'invoice' AND ref_id = $1 AND direction = 'in'
            )`,
          [invoiceId, amount],
        );
      }
    }
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// --- M4 Finance (cash ledger, expenses, budgets, assets, P&L) ----------------

export interface CashAccountBalance {
  account: string;
  balance: number;
}

export interface CashPosition {
  accounts: CashAccountBalance[];
  total: number;
}

export interface CashEntryRow {
  id: string;
  direction: "in" | "out";
  amount: number;
  account: string;
  category: string;
  refType: string | null;
  note: string | null;
  occurredAt: string;
  balance: number; // running net over the returned rows, oldest→newest
}

export interface ExpenseCategoryRow {
  id: string;
  code: string;
  name: string;
  type: "opex" | "marketing" | "capex";
  monthlyBudget: number | null;
}

export interface BudgetRow {
  code: string;
  name: string;
  monthlyBudget: number;
  spent: number;
}

export interface AssetRow {
  id: string;
  name: string;
  category: string;
  status: "planned" | "owned" | "disposed";
  purchaseCost: number | null;
  purchasedAt: string | null;
  targetMonth: string | null;
  usefulLifeMonths: number | null;
  salvageValue: number;
  monthlyDepreciation: number;
}

export interface PayablePurchaseRow {
  id: string;
  supplierName: string | null;
  invoiceRef: string | null;
  receivedAt: string | null;
  dueDate: string | null;
  total: number;
}

export interface CashEntryFilter {
  month?: string | null; // "YYYY-MM"
  direction?: "in" | "out" | null;
  account?: string | null;
}

/** Live cash position per account (SUM of ins − outs). No stored balance ever —
 *  the ledger is the single source of truth (PRD §3). */
export async function getCashPosition(): Promise<CashPosition> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT account,
            COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS balance
       FROM ops.cash_entries
      GROUP BY account
      ORDER BY account`,
  );
  const accounts = rows.map((r) => ({ account: r.account as string, balance: num(r.balance) }));
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return { accounts, total };
}

/** Cash ledger, filtered + limited, newest first, each row carrying a running
 *  net balance computed over the returned set (oldest→newest). */
export async function listCashEntries(filter: CashEntryFilter = {}, limit = 200): Promise<CashEntryRow[]> {
  const p = await pool();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.month) {
    params.push(filter.month + "-01");
    where.push(`occurred_at >= $${params.length}::date AND occurred_at < ($${params.length}::date + interval '1 month')`);
  }
  if (filter.direction === "in" || filter.direction === "out") {
    params.push(filter.direction);
    where.push(`direction = $${params.length}`);
  }
  if (filter.account) {
    params.push(filter.account);
    where.push(`account = $${params.length}`);
  }
  params.push(limit);
  const { rows } = await p.query(
    `SELECT id, direction, amount, account, category, ref_type, note, occurred_at
       FROM ops.cash_entries
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY occurred_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  // Running balance: fold oldest→newest, then present newest-first.
  let bal = 0;
  const ascending = [...rows].reverse().map((r) => {
    const amount = num(r.amount);
    bal += (r.direction as string) === "in" ? amount : -amount;
    return {
      id: String(r.id),
      direction: r.direction as "in" | "out",
      amount,
      account: r.account as string,
      category: r.category as string,
      refType: (r.ref_type as string) ?? null,
      note: (r.note as string) ?? null,
      occurredAt: r.occurred_at as string,
      balance: bal,
    };
  });
  return ascending.reverse();
}

export async function listExpenseCategories(): Promise<ExpenseCategoryRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, code, name, type, monthly_budget FROM ops.expense_categories ORDER BY type, code`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    type: r.type as "opex" | "marketing" | "capex",
    monthlyBudget: r.monthly_budget == null ? null : num(r.monthly_budget),
  }));
}

/** Budgeted categories (any type) with month-to-date spend vs monthly budget. */
export async function listBudgetVsSpend(month: string): Promise<BudgetRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT ec.code, ec.name, ec.monthly_budget,
            COALESCE(sum(e.amount), 0) AS spent
       FROM ops.expense_categories ec
       LEFT JOIN ops.expenses e
         ON e.category_id = ec.id
        AND e.occurred_at >= $1::date
        AND e.occurred_at < ($1::date + interval '1 month')
      WHERE ec.monthly_budget IS NOT NULL
      GROUP BY ec.code, ec.name, ec.monthly_budget
      ORDER BY ec.code`,
    [month + "-01"],
  );
  return rows.map((r) => ({
    code: r.code as string,
    name: r.name as string,
    monthlyBudget: num(r.monthly_budget),
    spent: num(r.spent),
  }));
}

/** Create an expense category (with an optional monthly budget). */
export async function createExpenseCategory(input: {
  code: string;
  name: string;
  type: "opex" | "marketing" | "capex";
  monthlyBudget: number | null;
}): Promise<string> {
  const p = await pool();
  const { rows } = await p.query(
    `INSERT INTO ops.expense_categories (code, name, type, monthly_budget)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.code.trim(), input.name.trim(), input.type, input.monthlyBudget],
  );
  return rows[0].id as string;
}

/** Rename a category and/or set/clear its monthly budget. */
export async function updateExpenseCategory(
  id: string,
  patch: { name?: string; monthlyBudget?: number | null },
): Promise<void> {
  const p = await pool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name.trim()); }
  if (patch.monthlyBudget !== undefined) { sets.push(`monthly_budget = $${i++}`); vals.push(patch.monthlyBudget); }
  if (sets.length === 0) return;
  vals.push(id);
  await p.query(`UPDATE ops.expense_categories SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

/**
 * Delete a category. Blocked when expenses reference it — those are booked
 * ledger history; clear the budget or stop using the category instead.
 */
export async function deleteExpenseCategory(id: string): Promise<"deleted" | "blocked"> {
  const p = await pool();
  const used = await p.query(`SELECT 1 FROM ops.expenses WHERE category_id = $1 LIMIT 1`, [id]);
  if (used.rows[0]) return "blocked";
  await p.query(`DELETE FROM ops.expense_categories WHERE id = $1`, [id]);
  return "deleted";
}

export async function listAssets(): Promise<AssetRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, name, category, status, purchase_cost, purchased_at, target_month,
            useful_life_months, salvage_value
       FROM ops.assets
      ORDER BY (status = 'owned') DESC, (status = 'planned') DESC, name`,
  );
  return rows.map((r) => {
    const purchaseCost = r.purchase_cost == null ? null : num(r.purchase_cost);
    const usefulLifeMonths = r.useful_life_months == null ? null : num(r.useful_life_months);
    const salvageValue = num(r.salvage_value);
    const status = r.status as "planned" | "owned" | "disposed";
    return {
      id: r.id as string,
      name: r.name as string,
      category: r.category as string,
      status,
      purchaseCost,
      purchasedAt: (r.purchased_at as string) ?? null,
      targetMonth: (r.target_month as string) ?? null,
      usefulLifeMonths,
      salvageValue,
      monthlyDepreciation: monthlyDepreciation({ status, purchaseCost, salvageValue, usefulLifeMonths }),
    };
  });
}

/** Received-but-unpaid purchases — the AP list (F1 "invoice due date lands in
 *  AP"). Total is summed from lines (never a stored total). */
export async function listPayablePurchases(): Promise<PayablePurchaseRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pu.id, s.name AS supplier_name, pu.invoice_ref, pu.received_at, pu.due_date,
            COALESCE(sum(pl.qty * pl.unit_cost), 0) AS total
       FROM ops.purchases pu
       LEFT JOIN ops.suppliers s ON s.id = pu.supplier_id
       LEFT JOIN ops.purchase_lines pl ON pl.purchase_id = pu.id
      WHERE pu.status = 'received'
      GROUP BY pu.id, s.name, pu.invoice_ref, pu.received_at, pu.due_date
      ORDER BY pu.received_at ASC NULLS LAST`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    supplierName: (r.supplier_name as string) ?? null,
    invoiceRef: (r.invoice_ref as string) ?? null,
    receivedAt: (r.received_at as string) ?? null,
    dueDate: (r.due_date as string) ?? null,
    total: num(r.total),
  }));
}

/** Accrual P&L for a date range: revenue (net of channel fees) − COGS = gross
 *  profit; − opex − marketing − depreciation = operating profit. Every figure
 *  is summed from ledger/line rows; nothing is a stored total (PRD §M4). */
export async function getPnL(startISO: string, endISO: string): Promise<PnL> {
  const p = await pool();
  // Revenue + COGS from sales (per-order fee so the flat fee counts once/order).
  const salesQ = p.query(
    `SELECT COALESCE(sum(o.gross), 0) AS gross,
            COALESCE(sum(o.gross * o.fee_pct + CASE WHEN o.gross > 0 THEN o.fee_flat ELSE 0 END), 0) AS fee,
            COALESCE(sum(o.cogs), 0) AS cogs
       FROM (
         SELECT so.id, c.fee_pct, c.fee_flat,
                sum(sl.unit_price * sl.qty) AS gross,
                sum(COALESCE(sl.unit_cogs, 0) * sl.qty) AS cogs
           FROM ops.sales_orders so
           JOIN ops.channels c ON c.id = so.channel_id
           JOIN ops.sales_lines sl ON sl.sales_order_id = so.id
          WHERE so.ordered_at >= $1::date AND so.ordered_at < ($2::date + 1)
          GROUP BY so.id, c.fee_pct, c.fee_flat
       ) o`,
    [startISO, endISO],
  );
  // Opex + marketing from expenses (capex never hits P&L — it depreciates).
  const expQ = p.query(
    `SELECT ec.type, COALESCE(sum(e.amount), 0) AS amount
       FROM ops.expenses e
       JOIN ops.expense_categories ec ON ec.id = e.category_id
      WHERE e.occurred_at BETWEEN $1::date AND $2::date
      GROUP BY ec.type`,
    [startISO, endISO],
  );
  // Waste (spoilage) + shrinkage (net opname loss). Both left inventory without
  // a sale, so they're period costs. cost = −qty × unit_cost (loss/waste qty is
  // negative → positive cost; opname surplus qty is positive → negative =
  // "found" income). Opname respects the same from-deployment cutoff as its log.
  const leakQ = p.query(
    `SELECT
       COALESCE(sum(CASE WHEN reason = 'waste' THEN -qty * unit_cost ELSE 0 END), 0) AS waste,
       COALESCE(sum(CASE WHEN reason = 'opname_adj' THEN -qty * unit_cost ELSE 0 END), 0) AS shrinkage
     FROM ops.stock_moves
     WHERE created_at >= $1::date AND created_at < ($2::date + 1)
       AND (reason = 'waste'
            OR (reason = 'opname_adj' AND ref_type = 'opname'
                AND created_at >= COALESCE((SELECT (value #>> '{}')::timestamptz FROM ops.config WHERE key = 'opname_since'), '-infinity'::timestamptz)))`,
    [startISO, endISO],
  );
  // Sample/KOL + R&D units given away, valued at their made-cost — the cost that
  // never became sellable (decision: reclassed here rather than lost in inventory).
  const carveQ = p.query(
    `SELECT COALESCE(sum((bl.qty_sample + bl.qty_kol) * bl.cost_per_unit), 0) AS samples,
            COALESCE(sum(bl.qty_rnd * bl.cost_per_unit), 0) AS rnd
       FROM ops.batch_lines bl
       JOIN ops.production_batches pb ON pb.id = bl.batch_id
      WHERE pb.status = 'closed' AND bl.cost_per_unit IS NOT NULL
        AND pb.baked_at BETWEEN $1::date AND $2::date`,
    [startISO, endISO],
  );
  // Labor = NON-production payroll only (decision B: baker/packer labor is
  // absorbed into COGS via batch labor; officers/admin are a period expense).
  const laborQ = p.query(
    `SELECT COALESCE(sum(pl.net), 0) AS labor
       FROM ops.payroll_lines pl
       JOIN ops.payroll_runs pr ON pr.id = pl.run_id
       JOIN ops.staff s ON s.id = pl.staff_id
      WHERE pr.period = to_char($1::date, 'YYYY-MM')
        AND s.role NOT IN ('baker', 'packer')`,
    [startISO],
  );
  const [sales, exp, leak, carve, lab] = await Promise.all([salesQ, expQ, leakQ, carveQ, laborQ]);
  const s = sales.rows[0];
  const revenue = num(s.gross) - num(s.fee);
  const cogs = num(s.cogs);
  let opex = 0;
  let marketing = 0;
  for (const r of exp.rows) {
    if (r.type === "opex") opex = num(r.amount);
    else if (r.type === "marketing") marketing = num(r.amount);
  }
  const waste = num(leak.rows[0].waste);
  const shrinkage = num(leak.rows[0].shrinkage);
  const samples = num(carve.rows[0].samples);
  const rnd = num(carve.rows[0].rnd);
  const labor = num(lab.rows[0].labor);
  // Depreciation of owned assets (straight-line monthly) is a P&L cost.
  const assets = await listAssets();
  const depreciation = assets.reduce((sum, a) => sum + a.monthlyDepreciation, 0);
  return assemblePnL({ revenue, cogs, labor, opex, marketing, samples, rnd, waste, shrinkage, depreciation });
}

// --- M4 writes (append cash movements alongside the source row) --------------

/** Record an expense + its paired cash-out entry in one transaction (HANDOFF
 *  §1.5). The cash entry is tagged with the category code so cash and P&L
 *  reconcile by category. */
export async function createExpense(input: {
  categoryId: string;
  amount: number;
  vendor: string | null;
  note: string | null;
  campaignRef: string | null;
  occurredAt: string | null;
  recurring: boolean;
  account: string;
}): Promise<{ expenseId: string }> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const cat = await client.query(`SELECT code FROM ops.expense_categories WHERE id = $1`, [input.categoryId]);
    if (!cat.rows[0]) throw new Error("category not found");
    const code = cat.rows[0].code as string;

    const ex = await client.query(
      `INSERT INTO ops.expenses (category_id, amount, vendor, note, campaign_ref, occurred_at, recurring)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7) RETURNING id, occurred_at`,
      [input.categoryId, input.amount, input.vendor?.trim() || null, input.note?.trim() || null, input.campaignRef?.trim() || null, input.occurredAt || null, input.recurring],
    );
    const expenseId = ex.rows[0].id as string;

    await client.query(
      `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, occurred_at, note)
       VALUES ('out', $1, $2, $3, 'expense', $4, $5, $6)`,
      [input.amount, input.account, code, expenseId, ex.rows[0].occurred_at, input.vendor?.trim() || input.note?.trim() || null],
    );

    await client.query("COMMIT");
    return { expenseId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Mark a received purchase paid → posts the ingredient cash-out (F1/HANDOFF
 *  §1.5). Guarded on status='received' so it can't double-post; the purchase
 *  total is recomputed from its lines, never trusted from input. */
export async function markPurchasePaid(purchaseId: string, account: string): Promise<{ total: number } | null> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE ops.purchases SET status = 'paid' WHERE id = $1 AND status = 'received' RETURNING id`,
      [purchaseId],
    );
    if ((upd.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return null; // not found or already paid
    }
    const tot = await client.query(
      `SELECT COALESCE(sum(qty * unit_cost), 0) AS total FROM ops.purchase_lines WHERE purchase_id = $1`,
      [purchaseId],
    );
    const total = num(tot.rows[0].total);
    if (total > 0) {
      await client.query(
        `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, note)
         VALUES ('out', $1, $2, 'ingredients', 'purchase', $3, 'Purchase paid')`,
        [total, account, purchaseId],
      );
    }
    await client.query("COMMIT");
    return { total };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Mark a planned asset as owned → records the purchase + posts the capex
 *  cash-out (PRD §M4a: capex hits cash immediately, then depreciates monthly).
 *  Guarded on status='planned' so the cash-out posts once. */
export async function markAssetOwned(input: {
  assetId: string;
  purchaseCost: number | null;
  purchasedAt: string | null;
  account: string;
}): Promise<{ cost: number } | null> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE ops.assets
          SET status = 'owned',
              purchase_cost = COALESCE($2, purchase_cost),
              purchased_at = COALESCE($3::date, CURRENT_DATE)
        WHERE id = $1 AND status = 'planned'
        RETURNING purchase_cost, purchased_at`,
      [input.assetId, input.purchaseCost, input.purchasedAt || null],
    );
    if ((upd.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const cost = num(upd.rows[0].purchase_cost);
    if (cost > 0) {
      await client.query(
        `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, occurred_at, note)
         VALUES ('out', $1, $2, 'capex', 'asset', $3, $4, 'Capex purchase')`,
        [cost, input.account, input.assetId, upd.rows[0].purchased_at],
      );
    }
    await client.query("COMMIT");
    return { cost };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export interface AssetInput {
  name: string;
  category: string; // production | storage | other
  status: string; // planned | owned  (created as register entry — no cash posted)
  purchaseCost: number | null;
  targetMonth: string | null;
  usefulLifeMonths: number | null;
  salvageValue: number;
  purchasedAt: string | null;
}

/** Add an asset to the register. Pure register entry — no cash is posted (an
 *  owned asset added here is assumed already paid; use "mark bought" on a
 *  planned asset to post the capex cash-out). */
export async function createAsset(input: AssetInput): Promise<string> {
  const p = await pool();
  const { rows } = await p.query(
    `INSERT INTO ops.assets (name, category, status, purchase_cost, target_month, useful_life_months, salvage_value, purchased_at)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7,
             CASE WHEN $3 = 'owned' THEN COALESCE($8::date, CURRENT_DATE) ELSE $8::date END)
     RETURNING id`,
    [input.name.trim(), input.category, input.status, input.purchaseCost, input.targetMonth, input.usefulLifeMonths, input.salvageValue, input.purchasedAt],
  );
  return rows[0].id as string;
}

/** Edit an asset's descriptive fields (no cash side-effects; status changes go
 *  through mark-bought / dispose). */
export async function updateAsset(
  id: string,
  input: { name: string; category: string; purchaseCost: number | null; targetMonth: string | null; usefulLifeMonths: number | null; salvageValue: number },
): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(
    `UPDATE ops.assets
        SET name = $2, category = $3, purchase_cost = $4, target_month = $5::date,
            useful_life_months = $6, salvage_value = $7
      WHERE id = $1`,
    [id, input.name.trim(), input.category, input.purchaseCost, input.targetMonth, input.usefulLifeMonths, input.salvageValue],
  );
  return (rowCount ?? 0) > 0;
}

/** Retire an asset — stops depreciation. Ledger-safe (keeps the row + its capex
 *  history) unlike a hard delete. */
export async function disposeAsset(id: string): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(`UPDATE ops.assets SET status = 'disposed' WHERE id = $1 AND status <> 'disposed'`, [id]);
  return (rowCount ?? 0) > 0;
}

/** Hard-delete an asset, but only if no capex cash entry references it (i.e. it
 *  was never bought through the system). Owned/bought assets return "blocked" —
 *  dispose them instead so the cash ledger stays intact. */
export async function deleteAsset(id: string): Promise<"deleted" | "blocked" | "notfound"> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const ex = await client.query(`SELECT 1 FROM ops.assets WHERE id = $1`, [id]);
    if (!ex.rows[0]) { await client.query("ROLLBACK"); return "notfound"; }
    const cash = await client.query(`SELECT 1 FROM ops.cash_entries WHERE ref_type = 'asset' AND ref_id = $1 LIMIT 1`, [id]);
    if (cash.rows[0]) { await client.query("ROLLBACK"); return "blocked"; }
    await client.query(`DELETE FROM ops.assets WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return "deleted";
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// --- M5 HR (staff, attendance, payroll) --------------------------------------

export interface StaffRow {
  id: string;
  name: string;
  role: string;
  payType: string;
  rate: number;
  batchBonus: number;
  equityPct: number | null;
  active: boolean;
  canLogin: boolean;
}

export interface PayrollPreviewLine {
  staffId: string;
  name: string;
  payType: string;
  attendanceDays: number;
  qualifyingBatches: number;
  base: number;
  batchIncentive: number;
  thrAccrual: number;
  net: number;
}

export interface PayrollRunRow {
  id: string;
  period: string;
  status: string;
  total: number;
  staffCount: number;
  createdAt: string;
}

export async function listStaff(): Promise<StaffRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, name, role, pay_type, rate, batch_bonus, equity_pct, active, can_login
       FROM ops.staff ORDER BY active DESC, name`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    role: r.role as string,
    payType: r.pay_type as string,
    rate: num(r.rate),
    batchBonus: num(r.batch_bonus),
    equityPct: r.equity_pct == null ? null : num(r.equity_pct),
    active: Boolean(r.active),
    canLogin: Boolean(r.can_login),
  }));
}

/** Match a login password against every enabled staff account (password-only
 *  login — the password identifies the staff member). Returns the staff on a
 *  hit, else null. Scrypt-verified (lib/password.ts). */
export async function findStaffLogin(password: string): Promise<{ id: string; name: string } | null> {
  if (!password) return null;
  const p = await pool();
  const { rows } = await p.query(
    `SELECT id, name, password_hash FROM ops.staff WHERE can_login = true AND active AND password_hash IS NOT NULL`,
  );
  for (const r of rows) {
    if (verifyPassword(password, r.password_hash as string)) {
      return { id: r.id as string, name: r.name as string };
    }
  }
  return null;
}

/** Set (or reset) a staff member's login password and enable login. */
export async function setStaffPassword(staffId: string, password: string): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(
    `UPDATE ops.staff SET password_hash = $2, can_login = true WHERE id = $1`,
    [staffId, hashPassword(password)],
  );
  return (rowCount ?? 0) > 0;
}

/** Disable a staff member's login (keeps the hash cleared). */
export async function disableStaffLogin(staffId: string): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(
    `UPDATE ops.staff SET can_login = false, password_hash = NULL WHERE id = $1`,
    [staffId],
  );
  return (rowCount ?? 0) > 0;
}

/** A staff member's own attendance summary for the current month + whether
 *  today is already logged (drives the staff "Log day" dashboard). */
export async function getStaffMonthAttendance(
  staffId: string,
  monthStart: string,
  monthEnd: string,
  today: string,
): Promise<{ name: string; daysThisMonth: number; loggedToday: boolean }> {
  const p = await pool();
  const [staff, days, todayRow] = await Promise.all([
    p.query(`SELECT name FROM ops.staff WHERE id = $1`, [staffId]),
    p.query(`SELECT count(DISTINCT date)::int AS n FROM ops.attendance WHERE staff_id = $1 AND date BETWEEN $2 AND $3`, [staffId, monthStart, monthEnd]),
    p.query(`SELECT 1 FROM ops.attendance WHERE staff_id = $1 AND date = $2 LIMIT 1`, [staffId, today]),
  ]);
  return {
    name: (staff.rows[0]?.name as string) ?? "",
    daysThisMonth: num(days.rows[0]?.n),
    loggedToday: (todayRow.rowCount ?? 0) > 0,
  };
}

export async function createStaff(input: {
  name: string;
  role: string;
  payType: string;
  rate: number;
  batchBonus: number;
}): Promise<string> {
  const p = await pool();
  const { rows } = await p.query(
    `INSERT INTO ops.staff (name, role, pay_type, rate, batch_bonus, hired_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE) RETURNING id`,
    [input.name.trim(), input.role, input.payType, input.rate, input.batchBonus],
  );
  return rows[0].id as string;
}

export async function setStaffActive(staffId: string, active: boolean): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(`UPDATE ops.staff SET active = $2 WHERE id = $1`, [staffId, active]);
  return (rowCount ?? 0) > 0;
}

/** Log a worked day (attendance). One row per staff per date (idempotent).
 *  source 'admin' when a super-admin logs it, 'self' when the staff member does. */
export async function logAttendance(staffId: string, date: string, source: "admin" | "self" = "admin"): Promise<void> {
  const p = await pool();
  await p.query(
    `INSERT INTO ops.attendance (staff_id, date, source) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [staffId, date, source],
  );
}

/** Days worked per staff within [start,end]. */
async function attendanceDaysByStaff(start: string, end: string): Promise<Map<string, number>> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT staff_id, count(DISTINCT date)::int AS days FROM ops.attendance
      WHERE date BETWEEN $1 AND $2 GROUP BY staff_id`,
    [start, end],
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.staff_id as string, num(r.days));
  return m;
}

/** Batches closed in [start,end] at yield ≥95% of plan (drives the quality bonus). */
async function qualifyingBatches(start: string, end: string): Promise<number> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT count(*)::int AS n FROM ops.production_batches
      WHERE status = 'closed' AND baked_at BETWEEN $1 AND $2
        AND planned_qty > 0 AND actual_yield / planned_qty >= 0.95`,
    [start, end],
  );
  return num(rows[0].n);
}

async function thrRate(): Promise<number> {
  const p = await pool();
  const { rows } = await p.query(`SELECT (value #>> '{}')::numeric AS r FROM ops.config WHERE key = 'thr_accrual_rate'`);
  return rows[0] ? num(rows[0].r) : 0.0833;
}

/** Period "YYYY-MM" → first/last calendar day. */
function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = `${period}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export async function getPayrollPreview(period: string): Promise<{ lines: PayrollPreviewLine[]; total: number; thrTotal: number; alreadyRun: boolean }> {
  const { computePayrollLine } = await import("./opsFinance");
  const { start, end } = periodBounds(period);
  const p = await pool();
  const [staff, days, batches, rate, existing] = await Promise.all([
    listStaff(),
    attendanceDaysByStaff(start, end),
    qualifyingBatches(start, end),
    thrRate(),
    p.query(`SELECT 1 FROM ops.payroll_runs WHERE period = $1 LIMIT 1`, [period]),
  ]);
  const active = staff.filter((s) => s.active);
  const lines: PayrollPreviewLine[] = active.map((s) => {
    const attendanceDays = days.get(s.id) ?? 0;
    const line = computePayrollLine({ payType: s.payType, rate: s.rate, batchBonus: s.batchBonus }, { attendanceDays, qualifyingBatches: batches, thrRate: rate });
    return {
      staffId: s.id,
      name: s.name,
      payType: s.payType,
      attendanceDays,
      qualifyingBatches: batches,
      base: line.base,
      batchIncentive: line.batchIncentive,
      thrAccrual: line.thrAccrual,
      net: line.net,
    };
  });
  return {
    lines,
    total: lines.reduce((s, l) => s + l.net, 0),
    thrTotal: lines.reduce((s, l) => s + l.thrAccrual, 0),
    alreadyRun: (existing.rowCount ?? 0) > 0,
  };
}

/** Run payroll for a period: create the run + lines and post one cash-out for
 *  the total net (THR accrues but is not disbursed here). Idempotent per period. */
export async function runPayroll(period: string): Promise<{ runId: string; total: number }> {
  const { computePayrollLine } = await import("./opsFinance");
  const { start, end } = periodBounds(period);
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(`SELECT 1 FROM ops.payroll_runs WHERE period = $1 LIMIT 1`, [period]);
    if ((dup.rowCount ?? 0) > 0) throw new Error("payroll already run for this period");

    const [staff, days, batches, rate] = await Promise.all([
      listStaff(),
      attendanceDaysByStaff(start, end),
      qualifyingBatches(start, end),
      thrRate(),
    ]);
    const active = staff.filter((s) => s.active);
    const computed = active.map((s) => ({
      s,
      line: computePayrollLine({ payType: s.payType, rate: s.rate, batchBonus: s.batchBonus }, { attendanceDays: days.get(s.id) ?? 0, qualifyingBatches: batches, thrRate: rate }),
    }));
    const total = computed.reduce((sum, c) => sum + c.line.net, 0);

    const run = await client.query(
      `INSERT INTO ops.payroll_runs (period, status, total) VALUES ($1, 'paid', $2) RETURNING id`,
      [period, total],
    );
    const runId = run.rows[0].id as string;

    for (const c of computed) {
      await client.query(
        `INSERT INTO ops.payroll_lines (run_id, staff_id, base, batch_incentive, deductions, thr_accrual, net)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [runId, c.s.id, c.line.base, c.line.batchIncentive, c.line.deductions, c.line.thrAccrual, c.line.net],
      );
    }

    if (total > 0) {
      await client.query(
        `INSERT INTO ops.cash_entries (direction, amount, account, category, ref_type, ref_id, occurred_at, note)
         VALUES ('out', $1, 'bank', 'payroll', 'payroll_run', $2, $3, $4)`,
        [total, runId, end, `Payroll ${period}`],
      );
    }

    await client.query("COMMIT");
    return { runId, total };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// --- M6 Projections (read-only views over the ledgers) -----------------------

export interface DemandRow {
  sku: string;
  name: string;
  units: number;
  revenue: number;
}

export interface PurchasePlanRow {
  name: string;
  unit: string;
  need: number;
  onHand: number;
  short: number;
}

export interface CashWeek {
  weekStart: string;
  inflow: number;
  outflow: number;
  net: number;
  balance: number;
}

/** Units + revenue sold per SKU over the trailing N days (demand velocity). */
export async function getDemandVelocity(days = 28): Promise<DemandRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pr.sku, pr.name,
            COALESCE(sum(sl.qty), 0) AS units,
            COALESCE(sum(sl.qty * sl.unit_price), 0) AS revenue
       FROM ops.products pr
       LEFT JOIN ops.sales_lines sl ON sl.product_id = pr.id
       LEFT JOIN ops.sales_orders so ON so.id = sl.sales_order_id
            AND so.ordered_at >= (now() - ($1 || ' days')::interval)
            AND so.status <> 'cancelled'
      WHERE pr.active
      GROUP BY pr.sku, pr.name
      ORDER BY units DESC, pr.sku`,
    [String(days)],
  );
  return rows.map((r) => ({ sku: r.sku as string, name: r.name as string, units: num(r.units), revenue: num(r.revenue) }));
}

/** MRP-lite: ingredients needed to bake one standard batch of every active
 *  recipe, minus current stock → the suggested shopping list. */
export async function getPurchasePlan(): Promise<PurchasePlanRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT i.name, i.unit,
            round(sum(rl.qty_per_batch), 4) AS need,
            COALESCE(b.qty_on_hand, 0) AS on_hand
       FROM ops.recipe_lines rl
       JOIN ops.recipes r ON r.id = rl.recipe_id AND r.active
       JOIN ops.items i ON i.id = rl.item_id
       LEFT JOIN ops.v_stock_balance b ON b.item_id = i.id
      GROUP BY i.id, i.name, i.unit, b.qty_on_hand
      ORDER BY (COALESCE(b.qty_on_hand,0) < sum(rl.qty_per_batch)) DESC, i.name`,
  );
  return rows.map((r) => {
    const need = num(r.need);
    const onHand = num(r.on_hand);
    return { name: r.name as string, unit: r.unit as string, need, onHand, short: Math.max(0, need - onHand) };
  });
}

/** Estimated monthly payroll (last run if any, else active-staff run-rate). */
async function estimatedMonthlyPayroll(): Promise<number> {
  const p = await pool();
  const last = await p.query(`SELECT total FROM ops.payroll_runs ORDER BY period DESC LIMIT 1`);
  if (last.rows[0]) return num(last.rows[0].total);
  const staff = await listStaff();
  return staff
    .filter((s) => s.active)
    .reduce((sum, s) => sum + (s.payType === "monthly" ? s.rate : s.payType === "per_batch" ? s.rate * 5 : s.rate * 9), 0);
}

/**
 * 13-week cash projection (PRD §M6). Starts at the current cash position and
 * layers weekly outflows (recurring expenses + payroll run-rate, spread evenly)
 * and inflows (unpaid B2B invoices on their due date, planned capex on its
 * target month). A rough but honest forward look — flags weeks that go negative.
 */
export async function get13WeekCash(): Promise<{ startBalance: number; weeks: CashWeek[] }> {
  const p = await pool();
  const [pos, recurring, payroll, inv, assets] = await Promise.all([
    getCashPosition(),
    p.query(`SELECT COALESCE(sum(amount), 0) AS m FROM ops.expenses WHERE recurring`),
    estimatedMonthlyPayroll(),
    p.query(`SELECT due_date, amount FROM ops.invoices WHERE status NOT IN ('paid','void') AND due_date IS NOT NULL`),
    p.query(`SELECT target_month, purchase_cost FROM ops.assets WHERE status = 'planned' AND target_month IS NOT NULL AND purchase_cost IS NOT NULL`),
  ]);
  const recurringMonthly = num(recurring.rows[0].m);
  const weeklyOut = (recurringMonthly + payroll) / (52 / 12); // monthly → weekly

  // Monday of the current week (UTC).
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

  const weeks: CashWeek[] = [];
  let balance = pos.total;
  for (let i = 0; i < 13; i++) {
    const wStart = new Date(monday);
    wStart.setUTCDate(wStart.getUTCDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setUTCDate(wEnd.getUTCDate() + 7);
    const inWeek = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso + "T00:00:00Z").getTime();
      return d >= wStart.getTime() && d < wEnd.getTime();
    };
    let inflow = 0;
    for (const r of inv.rows) if (inWeek(r.due_date as string)) inflow += num(r.amount);
    let outflow = weeklyOut;
    for (const a of assets.rows) {
      const tm = (a.target_month as string)?.slice(0, 7);
      if (tm && `${wStart.toISOString().slice(0, 7)}` === tm && wStart.getUTCDate() <= 7) outflow += num(a.purchase_cost);
    }
    const net = inflow - outflow;
    balance += net;
    weeks.push({ weekStart: wStart.toISOString().slice(0, 10), inflow, outflow, net, balance });
  }
  return { startBalance: pos.total, weeks };
}

export async function listPayrollRuns(): Promise<PayrollRunRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT pr.id, pr.period, pr.status, pr.total, pr.created_at,
            count(pl.id)::int AS staff_count
       FROM ops.payroll_runs pr
       LEFT JOIN ops.payroll_lines pl ON pl.run_id = pr.id
      GROUP BY pr.id ORDER BY pr.period DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    period: r.period as string,
    status: r.status as string,
    total: num(r.total),
    staffCount: num(r.staff_count),
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

// --- Item master CRUD (goods = ingredient, + packaging) ----------------------

export interface ItemDetailRow {
  id: string;
  name: string;
  type: "ingredient" | "packaging";
  unit: string;
  reorderPoint: number | null;
  avgCost: number;
  onHand: number;
  active: boolean;
}

/** All active items with live on-hand (from v_stock_balance). */
export async function listItemsWithStock(): Promise<ItemDetailRow[]> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT i.id, i.name, i.type, i.unit, i.reorder_point, i.avg_cost, i.active,
            COALESCE(b.qty_on_hand, 0) AS on_hand
       FROM ops.items i
       LEFT JOIN ops.v_stock_balance b ON b.item_id = i.id
      WHERE i.active
      ORDER BY i.type, i.name`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as "ingredient" | "packaging",
    unit: r.unit as string,
    reorderPoint: r.reorder_point == null ? null : num(r.reorder_point),
    avgCost: num(r.avg_cost),
    onHand: num(r.on_hand),
    active: Boolean(r.active),
  }));
}

export async function createItem(input: { name: string; type: string; unit: string; reorderPoint: number | null }): Promise<string> {
  const p = await pool();
  const { rows } = await p.query(
    `INSERT INTO ops.items (name, type, unit, reorder_point) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.name.trim(), input.type, input.unit.trim(), input.reorderPoint],
  );
  return rows[0].id as string;
}

export async function updateItem(id: string, input: { name: string; unit: string; reorderPoint: number | null }): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(
    `UPDATE ops.items SET name = $2, unit = $3, reorder_point = $4 WHERE id = $1`,
    [id, input.name.trim(), input.unit.trim(), input.reorderPoint],
  );
  return (rowCount ?? 0) > 0;
}

/** Deactivate an item (soft delete) — hard-delete only if it never moved stock. */
export async function deleteOrDeactivateItem(id: string): Promise<"deleted" | "deactivated" | "notfound"> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const used = await client.query(`SELECT 1 FROM ops.stock_moves WHERE item_id = $1 LIMIT 1`, [id]);
    const inRecipe = await client.query(`SELECT 1 FROM ops.recipe_lines WHERE item_id = $1 LIMIT 1`, [id]);
    let outcome: "deleted" | "deactivated" | "notfound";
    if ((used.rowCount ?? 0) === 0 && (inRecipe.rowCount ?? 0) === 0) {
      const del = await client.query(`DELETE FROM ops.items WHERE id = $1`, [id]);
      outcome = (del.rowCount ?? 0) > 0 ? "deleted" : "notfound";
    } else {
      const upd = await client.query(`UPDATE ops.items SET active = false WHERE id = $1`, [id]);
      outcome = (upd.rowCount ?? 0) > 0 ? "deactivated" : "notfound";
    }
    await client.query("COMMIT");
    return outcome;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Outbound packaging (bundle packing etc.) — deducts stock FEFO at avg cost via
 *  consume_fefo, tagged ref_type 'packaging_out' so it stays out of batch costs
 *  and waste reports. Returns the cost written out. */
export async function packagingOut(itemId: string, qty: number, note: string | null): Promise<number> {
  const p = await pool();
  const { rows } = await p.query(
    `SELECT ops.consume_fefo($1, $2, 'production_consume', 'packaging_out', NULL, $3) AS cost`,
    [itemId, qty, note || null],
  );
  return num(rows[0].cost);
}

// --- Recipe CRUD (adjustable BOM) --------------------------------------------

export interface RecipeLineRow {
  id: string;
  itemId: string;
  name: string;
  unit: string;
  type: "ingredient" | "packaging";
  qtyPerBatch: number;
}

export interface ProductRecipeRow {
  productId: string;
  sku: string;
  name: string;
  recipeId: string | null;
  batchYieldQty: number | null;
  hasBatches: boolean;
  lines: RecipeLineRow[];
}

/** Every active product with its recipe + BOM lines (split by item type in UI). */
export async function listProductRecipes(): Promise<ProductRecipeRow[]> {
  const p = await pool();
  const products = await p.query(
    `SELECT pr.id AS product_id, pr.sku, pr.name, r.id AS recipe_id, r.batch_yield_qty,
            EXISTS (SELECT 1 FROM ops.production_batches pb WHERE pb.recipe_id = r.id) AS has_batches
       FROM ops.products pr
       LEFT JOIN ops.recipes r ON r.product_id = pr.id AND r.active
      WHERE pr.active
      ORDER BY pr.is_bundle, pr.sku`,
  );
  const lines = await p.query(
    `SELECT rl.id, rl.recipe_id, rl.item_id, rl.qty_per_batch, i.name, i.unit, i.type
       FROM ops.recipe_lines rl JOIN ops.items i ON i.id = rl.item_id
      ORDER BY i.type, i.name`,
  );
  const byRecipe = new Map<string, RecipeLineRow[]>();
  for (const l of lines.rows) {
    const arr = byRecipe.get(l.recipe_id as string) ?? [];
    arr.push({
      id: l.id as string,
      itemId: l.item_id as string,
      name: l.name as string,
      unit: l.unit as string,
      type: l.type as "ingredient" | "packaging",
      qtyPerBatch: num(l.qty_per_batch),
    });
    byRecipe.set(l.recipe_id as string, arr);
  }
  return products.rows.map((r) => ({
    productId: r.product_id as string,
    sku: r.sku as string,
    name: r.name as string,
    recipeId: (r.recipe_id as string) ?? null,
    batchYieldQty: r.batch_yield_qty == null ? null : num(r.batch_yield_qty),
    hasBatches: Boolean(r.has_batches),
    lines: r.recipe_id ? byRecipe.get(r.recipe_id as string) ?? [] : [],
  }));
}

export async function createRecipe(productId: string, batchYieldQty: number): Promise<string> {
  const p = await pool();
  const { rows } = await p.query(
    `INSERT INTO ops.recipes (product_id, batch_yield_qty) VALUES ($1, $2) RETURNING id`,
    [productId, batchYieldQty],
  );
  return rows[0].id as string;
}

/**
 * Create a brand-new finished-good product together with its (empty) recipe in
 * one transaction — the "add recipe" flow when the product doesn't exist yet.
 * std_cost starts NULL and rolls in from the first closed batch; list price is
 * required by the schema (and Pricing reads it).
 */
export async function createProductWithRecipe(input: {
  sku: string;
  name: string;
  variant: string | null;
  listPrice: number;
  batchYieldQty: number;
}): Promise<{ productId: string; recipeId: string }> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const prod = await client.query(
      `INSERT INTO ops.products (sku, name, variant, list_price) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.sku.trim(), input.name.trim(), input.variant, input.listPrice],
    );
    const productId = prod.rows[0].id as string;
    const rec = await client.query(
      `INSERT INTO ops.recipes (product_id, batch_yield_qty) VALUES ($1, $2) RETURNING id`,
      [productId, input.batchYieldQty],
    );
    await client.query("COMMIT");
    return { productId, recipeId: rec.rows[0].id as string };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function updateRecipeYield(recipeId: string, batchYieldQty: number): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(`UPDATE ops.recipes SET batch_yield_qty = $2 WHERE id = $1`, [recipeId, batchYieldQty]);
  return (rowCount ?? 0) > 0;
}

export async function addRecipeLine(recipeId: string, itemId: string, qtyPerBatch: number): Promise<string> {
  const p = await pool();
  // If the item is already in the recipe, update its qty instead of duplicating.
  const existing = await p.query(`SELECT id FROM ops.recipe_lines WHERE recipe_id = $1 AND item_id = $2`, [recipeId, itemId]);
  if (existing.rows[0]) {
    await p.query(`UPDATE ops.recipe_lines SET qty_per_batch = $2 WHERE id = $1`, [existing.rows[0].id, qtyPerBatch]);
    return existing.rows[0].id as string;
  }
  const { rows } = await p.query(
    `INSERT INTO ops.recipe_lines (recipe_id, item_id, qty_per_batch) VALUES ($1, $2, $3) RETURNING id`,
    [recipeId, itemId, qtyPerBatch],
  );
  return rows[0].id as string;
}

export async function updateRecipeLine(lineId: string, qtyPerBatch: number): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(`UPDATE ops.recipe_lines SET qty_per_batch = $2 WHERE id = $1`, [lineId, qtyPerBatch]);
  return (rowCount ?? 0) > 0;
}

export async function deleteRecipeLine(lineId: string): Promise<boolean> {
  const p = await pool();
  const { rowCount } = await p.query(`DELETE FROM ops.recipe_lines WHERE id = $1`, [lineId]);
  return (rowCount ?? 0) > 0;
}

/** Remove a recipe — hard-delete (with lines) if it has no batch history, else
 *  deactivate so past batch costs stay reproducible (ledger-safe). */
export async function deleteOrDeactivateRecipe(recipeId: string): Promise<"deleted" | "deactivated" | "notfound"> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // Used by a legacy single-recipe batch OR any cycle line (batch_lines).
    const used = await client.query(
      `SELECT 1 FROM ops.production_batches WHERE recipe_id = $1
        UNION ALL SELECT 1 FROM ops.batch_lines WHERE recipe_id = $1 LIMIT 1`,
      [recipeId],
    );
    let outcome: "deleted" | "deactivated" | "notfound";
    if ((used.rowCount ?? 0) === 0) {
      await client.query(`DELETE FROM ops.recipe_lines WHERE recipe_id = $1`, [recipeId]);
      const del = await client.query(`DELETE FROM ops.recipes WHERE id = $1`, [recipeId]);
      outcome = (del.rowCount ?? 0) > 0 ? "deleted" : "notfound";
    } else {
      const upd = await client.query(`UPDATE ops.recipes SET active = false WHERE id = $1`, [recipeId]);
      outcome = (upd.rowCount ?? 0) > 0 ? "deactivated" : "notfound";
    }
    await client.query("COMMIT");
    return outcome;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Cancel an in-progress batch: restore consumed stock with correcting entries
 *  (append-only — never deletes ledger rows) and mark it cancelled. */
export async function cancelBatch(batchId: string): Promise<boolean> {
  const p = await pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const b = await client.query(`SELECT status, is_cycle FROM ops.production_batches WHERE id = $1`, [batchId]);
    if (!b.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    if (b.rows[0].status !== "in_progress") throw new Error("only in-progress batches can be cancelled");
    // Cycle batches tag their consumes to batch_lines — reverse via the RPC.
    if (b.rows[0].is_cycle) {
      const c = await client.query(`SELECT ops.cancel_batch_cycle($1) AS ok`, [batchId]);
      await client.query("COMMIT");
      return c.rows[0]?.ok === true;
    }
    // Legacy single-recipe batch: reverse each consume with an opposite move.
    await client.query(
      `INSERT INTO ops.stock_moves (item_id, qty, reason, ref_type, ref_id, unit_cost, note)
       SELECT item_id, -qty, 'opname_adj', 'batch_cancel', $1, unit_cost, 'Batch cancelled — consumption reversed'
         FROM ops.stock_moves
        WHERE ref_type = 'production_batch' AND ref_id = $1 AND reason = 'production_consume'`,
      [batchId],
    );
    await client.query(`UPDATE ops.production_batches SET status = 'cancelled' WHERE id = $1`, [batchId]);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
