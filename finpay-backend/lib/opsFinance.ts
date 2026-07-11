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
  revenue: number; // GROSS revenue (channel/PG fees are a separate line — Audit H7)
  fees: number; // channel commission + payment-gateway fees (was netted into revenue)
  cogs: number; // inventory-driven, made-cost of goods sold
  grossProfit: number;
  labor: number; // non-production payroll (production labor sits in COGS — decision B)
  opex: number;
  marketing: number; // marketing spend (expenses)
  samples: number; // sample + KOL units given away, at made-cost
  rnd: number; // R&D units, at made-cost
  waste: number; // spoilage / failed bakes written off
  shrinkage: number; // net opname loss (surplus reduces it; can be negative = net found)
  depreciation: number;
  operatingProfit: number;
}

export function assemblePnL(parts: {
  revenue: number;
  fees: number;
  cogs: number;
  labor: number;
  opex: number;
  marketing: number;
  samples: number;
  rnd: number;
  waste: number;
  shrinkage: number;
  depreciation: number;
}): PnL {
  const grossProfit = parts.revenue - parts.cogs;
  const operatingProfit =
    grossProfit - parts.fees - parts.labor - parts.opex - parts.marketing - parts.samples - parts.rnd - parts.waste - parts.shrinkage - parts.depreciation;
  return { ...parts, grossProfit, operatingProfit };
}

export function formatPct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

// --- M5 payroll --------------------------------------------------------------

export interface PayrollInputs {
  attendanceDays: number; // logged work days in the period (drives daily pay)
  qualifyingBatches: number; // period batches closed at yield ≥95% (drives bonus)
  thrRate: number; // config thr_accrual_rate (0.0833 = 1/12)
}

export interface PayrollLine {
  base: number;
  batchIncentive: number;
  deductions: number;
  thrAccrual: number;
  net: number;
}

/**
 * One staff member's pay for a period (PRD §M5a). Monthly = flat rate; daily =
 * rate × days worked; per_batch = rate × qualifying batches. A per-batch quality
 * bonus (batch_bonus) is paid for each period batch that closed at yield ≥95%.
 * THR (Lebaran bonus) accrues at 1/12 of the period's cash pay so it never
 * ambushes cashflow — accrued here, disbursed later (not part of net cash-out).
 */
export function computePayrollLine(
  staff: { payType: string; rate: number; batchBonus: number },
  inp: PayrollInputs,
): PayrollLine {
  const base =
    staff.payType === "monthly"
      ? staff.rate
      : staff.payType === "per_batch"
        ? staff.rate * inp.qualifyingBatches
        : staff.rate * inp.attendanceDays; // daily
  const batchIncentive = staff.batchBonus > 0 ? staff.batchBonus * inp.qualifyingBatches : 0;
  const deductions = 0; // BPJS etc. out of scope v1 (PRD §M5)
  const thrAccrual = Math.round((base + batchIncentive) * inp.thrRate);
  const net = base + batchIncentive - deductions;
  return { base, batchIncentive, deductions, thrAccrual, net };
}
