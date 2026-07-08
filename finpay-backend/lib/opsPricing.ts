/**
 * Pure margin/pricing math (PRD §6 "margin guardrails", D8 B2B, D10 waste).
 *
 * No server or client deps so the exact same formulas run in the server page
 * and the client what-if calculator — the numbers can never drift between the
 * two. Every value is derived from the live ledger cost (`std_cost`, which the
 * moving-average receipt + batch costing keep current) and the `ops.config`
 * rates; nothing is a typed total (HANDOFF §2.2).
 */

export interface PricingConfig {
  wasteRate: number; // D10 — default 0.15, becomes trailing-30d actual once data exists
  marginFloor: number; // default 0.30
  bundleMarginFloor: number; // default 0.31
  b2bMargin: number; // D8 — true margin 0.35
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  wasteRate: 0.15,
  marginFloor: 0.3,
  bundleMarginFloor: 0.31,
  b2bMargin: 0.35,
};

/** Waste-adjusted effective unit cost — the cost the units that DO sell must
 *  carry (HANDOFF §2.3): effective = cost / (1 − waste_rate). */
export function effectiveCost(stdCost: number, wasteRate: number): number {
  const denom = 1 - wasteRate;
  return denom > 0 ? stdCost / denom : Infinity;
}

/** Live margin at a given selling price: (price − effective_cost) / price. */
export function marginAt(price: number, effCost: number): number {
  return price > 0 ? (price - effCost) / price : -Infinity;
}

/** The selling price that lands exactly on a target margin: eff / (1 − margin). */
export function priceForMargin(effCost: number, targetMargin: number): number {
  const denom = 1 - targetMargin;
  return denom > 0 ? effCost / denom : Infinity;
}

export interface PricingProductInput {
  id: string;
  sku: string;
  name: string;
  isBundle: boolean;
  stdCost: number;
  listPrice: number;
  wasteRate?: number | null; // per-product override; null/undefined = inherit general
}

export interface SkuPricing {
  id: string;
  sku: string;
  name: string;
  isBundle: boolean;
  stdCost: number;
  listPrice: number;
  wasteRate: number; // the effective rate actually used
  wasteFromProduct: boolean; // true if a per-product override drove it
  effCost: number;
  margin: number; // at current list price
  floor: number; // applicable floor (bundle vs standard)
  belowFloor: boolean;
  floorPrice: number; // min price to clear the floor
  b2bPrice: number; // D8 wholesale price at 35% true margin
}

/** Compute the full pricing row for one SKU. Waste-rate precedence:
 *  explicit override (what-if) → per-product rate → general config rate. */
export function computeSkuPricing(
  p: PricingProductInput,
  cfg: PricingConfig,
  wasteRateOverride?: number,
): SkuPricing {
  const productRate = p.wasteRate == null ? null : p.wasteRate;
  const wasteRate = wasteRateOverride ?? productRate ?? cfg.wasteRate;
  const effCost = effectiveCost(p.stdCost, wasteRate);
  const floor = p.isBundle ? cfg.bundleMarginFloor : cfg.marginFloor;
  const margin = marginAt(p.listPrice, effCost);
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    isBundle: p.isBundle,
    stdCost: p.stdCost,
    listPrice: p.listPrice,
    wasteRate,
    wasteFromProduct: wasteRateOverride == null && productRate != null,
    effCost,
    margin,
    floor,
    belowFloor: margin < floor,
    floorPrice: priceForMargin(effCost, floor),
    b2bPrice: priceForMargin(effCost, cfg.b2bMargin),
  };
}

export function formatPct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}
