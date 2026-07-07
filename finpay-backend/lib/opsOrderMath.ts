/**
 * Pure OMS economics (PRD §M3/§M4 "net revenue per order = price − channel fee
 * − unit_cogs"). No server/client deps so the quick-entry form and the server
 * order list compute identical numbers. Everything derives from the line rows +
 * the channel fee config — no stored order total (the "no typed totals" rule).
 */

export interface ChannelLite {
  id: string;
  name: string;
  feePct: number; // e.g. 0.20 for GoFood
  feeFlat: number; // per-order flat fee (Rp)
  settlementLagDays: number;
}

export interface EconomicsLine {
  qty: number;
  unitPrice: number;
  unitCogs: number;
}

export interface OrderEconomics {
  gross: number; // Σ price × qty
  cogs: number; // Σ unit_cogs × qty
  fee: number; // channel commission: gross × fee_pct + fee_flat
  net: number; // gross − fee − cogs
  marginPct: number; // net / gross
}

export function computeEconomics(lines: EconomicsLine[], feePct: number, feeFlat: number): OrderEconomics {
  const gross = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const cogs = lines.reduce((s, l) => s + l.unitCogs * l.qty, 0);
  const fee = gross > 0 ? gross * feePct + feeFlat : 0;
  const net = gross - fee - cogs;
  return { gross, cogs, fee, net, marginPct: gross > 0 ? net / gross : 0 };
}

export type AgingBucket = "paid" | "current" | "1-30" | "31-60" | "60+";

/** AR aging bucket for a B2B invoice, by days past due (PRD §M3 AR aging). */
export function agingBucket(status: string, dueDate: string | null, todayISO: string): AgingBucket {
  if (status === "paid" || status === "void") return "paid";
  if (!dueDate) return "current";
  const due = new Date(dueDate + "T00:00:00Z").getTime();
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  const daysOver = Math.floor((today - due) / 86400000);
  if (daysOver <= 0) return "current";
  if (daysOver <= 30) return "1-30";
  if (daysOver <= 60) return "31-60";
  return "60+";
}

export function formatPct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}
