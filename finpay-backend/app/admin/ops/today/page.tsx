import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import {
  opsEnabled,
  getCashPosition,
  getPnL,
  listReorderAlerts,
  listExpiringLots,
  listOpenBatches,
  listInvoices,
  listWaste30d,
  listPricingProducts,
  getPricingConfig,
} from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { computeSkuPricing } from "@/lib/opsPricing";
import { agingBucket } from "@/lib/opsOrderMath";
import { OpsShell, DbNotice, rupiah } from "../OpsChrome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ ...card, flex: "1 1 150px", minWidth: 140 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}

export default async function OpsTodayPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/today" title="Today">
        <DbNotice />
      </OpsShell>
    );
  }

  const month = monthRange();
  const today = new Date().toISOString().slice(0, 10);
  const [cash, pnl, reorder, expiring, batches, invoices, waste, products, cfg] = await Promise.all([
    getCashPosition(),
    getPnL(month.start, month.end),
    listReorderAlerts(),
    listExpiringLots(),
    listOpenBatches(),
    listInvoices(),
    listWaste30d(),
    listPricingProducts(),
    getPricingConfig(),
  ]);

  // §6 margin guardrails
  const belowFloor = products.map((p) => computeSkuPricing(p, cfg)).filter((s) => s.belowFloor);
  const wasteValue = waste.reduce((s, w) => s + w.wasteValue, 0);
  const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const overdue = outstanding.filter((i) => {
    const b = agingBucket(i.status, i.dueDate, today);
    return b !== "current" && b !== "paid";
  });
  const arTotal = outstanding.reduce((s, i) => s + i.amount, 0);

  const alerts: Array<{ text: string; tone: string; href: string }> = [];
  for (const s of belowFloor) alerts.push({ text: `${s.name} margin ${(s.margin * 100).toFixed(1)}% — below floor`, tone: "var(--red)", href: "/admin/ops/pricing" });
  for (const a of reorder) alerts.push({ text: `Reorder ${a.name} — ${a.qtyOnHand} ${a.unit} left`, tone: "var(--red)", href: "/admin/ops/stock" });
  for (const e of expiring) alerts.push({ text: `${e.item} expiring — ${e.daysLeft < 0 ? "expired" : e.daysLeft + "d left"}`, tone: "var(--orange)", href: "/admin/ops/stock" });
  for (const i of overdue) alerts.push({ text: `Invoice overdue — ${i.customerRef ?? i.number ?? "B2B"} ${rupiah(i.amount)}`, tone: "var(--orange)", href: "/admin/ops/orders" });

  return (
    <OpsShell active="/admin/ops/today" title="Today" subtitle={month.label}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Money at a glance */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Cash position" value={rupiah(cash.total)} tone={cash.total < 0 ? "var(--red)" : "var(--ink)"} />
          <Stat label="Revenue (mo)" value={rupiah(pnl.revenue)} />
          <Stat label="Gross profit (mo)" value={rupiah(pnl.grossProfit)} tone={pnl.grossProfit < 0 ? "var(--red)" : "var(--green)"} />
          <Stat label="Operating profit (mo)" value={rupiah(pnl.operatingProfit)} tone={pnl.operatingProfit < 0 ? "var(--red)" : "var(--green)"} />
        </div>

        {/* Alerts */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>
            GUARDRAILS &amp; ALERTS · {alerts.length}
          </div>
          {alerts.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>All clear — no alerts. 🎉</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {alerts.map((a, i) => (
                <Link key={i} href={a.href} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fff", border: `1.5px solid ${a.tone}`, borderRadius: 12, textDecoration: "none", color: "var(--ink)", fontSize: 13.5, fontWeight: 600 }}>
                  <span style={{ color: a.tone, fontWeight: 900 }}>•</span> {a.text}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Operational counts */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Open batches" value={String(batches.length)} />
          <Stat label="Low stock items" value={String(reorder.length)} tone={reorder.length ? "var(--red)" : "var(--ink)"} />
          <Stat label="AR outstanding" value={rupiah(arTotal)} tone={overdue.length ? "var(--orange)" : "var(--ink)"} />
          <Stat label="Waste (30d)" value={rupiah(wasteValue)} tone={wasteValue ? "var(--red)" : "var(--ink)"} />
        </div>
      </div>
    </OpsShell>
  );
}
