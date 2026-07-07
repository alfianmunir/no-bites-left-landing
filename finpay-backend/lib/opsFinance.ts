/**
 * Pure finance helpers (PRD §M4). Server + client share these so the Money
 * screen and any client preview compute identical figures. All P&L/cash numbers
 * themselves are summed server-side from ledger rows (cash_entries, expenses,
 * sales_lines) — never stored totals.
 */

/** Straight-line monthly depreciation (PRD §M4a). Only OWNED assets depreciate;
 *  planned ones are upcoming capex, not yet in opex. */
export function monthlyDepreciation(a: {
  status: string;
  purchaseCost: number | null;
  salvageValue: number;
  usefulLifeMonths: number | null;
}): number {
  if (a.status !== "owned" || !a.purchaseCost || !a.usefulLifeMonths || a.usefulLifeMonths <= 0) return 0;
  return Math.max(0, (a.purchaseCost - (a.salvageValue || 0)) / a.usefulLifeMonths);
}

/** First and last day (YYYY-MM-DD) of the month containing `d` (defaults today). */
export function monthRange(d = new Date()): { start: string; end: string; label: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return {
    start: iso(start),
    end: iso(end),
    label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export interface PnL {
  revenue: number; // net of channel fees
  cogs: number;
  grossProfit: number;
  opex: number;
  marketing: number;
  depreciation: number;
  operatingProfit: number;
}

export function assemblePnL(parts: {
  revenue: number;
  cogs: number;
  opex: number;
  marketing: number;
  depreciation: number;
}): PnL {
  const grossProfit = parts.revenue - parts.cogs;
  const operatingProfit = grossProfit - parts.opex - parts.marketing - parts.depreciation;
  return { ...parts, grossProfit, operatingProfit };
}

export function formatPct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}
