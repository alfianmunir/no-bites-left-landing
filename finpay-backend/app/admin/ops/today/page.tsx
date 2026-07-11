import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getOpsSession } from "@/lib/adminAuth";
import { OPS_STR, opsLangFromCookie } from "@/lib/opsI18n";
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
  getStaffMonthAttendance,
  listWebsiteOrderDrift,
  listSalesOrders,
} from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { computeSkuPricing } from "@/lib/opsPricing";
import { agingBucket } from "@/lib/opsOrderMath";
import { OpsShell, DbNotice, rupiah } from "../OpsChrome";
import StaffToday from "./StaffToday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const AMBER = "#d98b1e";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ ...card }}>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: "var(--soft)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}

/** Grouped alert card — a titled bordered card with a body + one/two actions. */
function AlertCard({ title, border, children, actions }: { title: string; border: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1.5px solid ${border}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 900, color: "var(--choco)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5, flex: 1 }}>{children}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div>
    </div>
  );
}

const pillSolid: React.CSSProperties = { padding: "8px 14px", borderRadius: 999, border: "none", background: "var(--choco)", color: "#fff", fontSize: 12.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" };
const pillGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--choco)", fontSize: 12.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" };

export default async function OpsTodayPage() {
  const session = await getOpsSession();
  if (!session) redirect("/admin/login");

  const L = OPS_STR[opsLangFromCookie((await cookies()).get("ops_lang")?.value)];

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/today" title={L.todayTitle}>
        <DbNotice />
      </OpsShell>
    );
  }

  const month = monthRange();
  const today = new Date().toISOString().slice(0, 10);

  // Staff (e.g. Heral) get a focused log-day dashboard, not the finance overview.
  if (session.role === "staff" && session.staffId) {
    const att = await getStaffMonthAttendance(session.staffId, month.start, month.end, today);
    return (
      <OpsShell active="/admin/ops/today" title={L.todayTitle} subtitle={month.label}>
        <StaffToday name={att.name} daysThisMonth={att.daysThisMonth} loggedToday={att.loggedToday} todayLabel={today} />
      </OpsShell>
    );
  }
  const [cash, pnl, reorder, expiring, batches, invoices, waste, products, cfg, drift, salesOrders] = await Promise.all([
    getCashPosition(),
    getPnL(month.start, month.end),
    listReorderAlerts(),
    listExpiringLots(),
    listOpenBatches(),
    listInvoices(),
    listWaste30d(),
    listPricingProducts(),
    getPricingConfig(),
    listWebsiteOrderDrift(),
    listSalesOrders(200),
  ]);

  // §6 margin guardrails — worst offender first (lowest margin).
  const belowFloor = products.map((p) => computeSkuPricing(p, cfg)).filter((s) => s.belowFloor).sort((a, b) => a.margin - b.margin);
  const worstMargin = belowFloor[0];
  const soonestExpiring = [...expiring].sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const wasteValue = waste.reduce((s, w) => s + w.wasteValue, 0);
  const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const overdue = outstanding.filter((i) => {
    const b = agingBucket(i.status, i.dueDate, today);
    return b !== "current" && b !== "paid";
  });
  const arTotal = outstanding.reduce((s, i) => s + i.amount, 0);

  // Prep banner counts — reuse the sales-orders projection (holds both channel
  // and website rows) so no extra store call: orders still in preparing, and
  // website pickups scheduled for today.
  const preparingCount = salesOrders.filter((o) => o.fulfillmentStatus === "preparing" && o.status !== "cancelled").length;
  const pickupsToday = salesOrders.filter((o) => o.channel === "website" && o.pickupDate === today && o.fulfillmentStatus !== "picked_up").length;

  // Alert count = every underlying alert (each reorder row / offender counts 1).
  const alertCount = drift.length + belowFloor.length + reorder.length + expiring.length + overdue.length;
  const floorPct = (cfg.marginFloor * 100).toFixed(0);

  return (
    <OpsShell active="/admin/ops/today" title={L.todayTitle} subtitle={month.label}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* 1. KPI grid — money at a glance */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))", gap: 12 }}>
          <Stat label={L.cash} value={rupiah(cash.total)} tone={cash.total < 0 ? "var(--red)" : "var(--ink)"} />
          <Stat label={L.revenue} value={rupiah(pnl.revenue)} />
          <Stat label={L.grossP} value={rupiah(pnl.grossProfit)} tone={pnl.grossProfit < 0 ? "var(--red)" : "var(--green)"} />
          <Stat label={L.opP} value={rupiah(pnl.operatingProfit)} tone={pnl.operatingProfit < 0 ? "var(--red)" : "var(--green)"} />
        </div>

        {/* 2. Guardrails & alerts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "var(--soft)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {L.guardrails} <span style={{ color: "var(--red)" }}>· {alertCount}</span>
          </div>

          {alertCount === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>{L.allClear}</div>
          ) : (
            <>
              {/* 3. Money-critical rows: website→finance drift + overdue invoices. */}
              {(drift.length > 0 || overdue.length > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {drift.map((d) => (
                    <Link key={`drift-${d.orderId}`} href="/admin/ops/orders" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 14px", background: "#fff", border: "1.5px solid var(--red)", borderRadius: 12, textDecoration: "none", color: "var(--ink)", fontSize: 13, fontWeight: 700 }}>
                      <span>{L.driftRow(d.customerName, rupiah(d.amount))}</span>
                      <span style={{ color: "var(--soft)" }} aria-hidden>›</span>
                    </Link>
                  ))}
                  {overdue.map((i) => (
                    <Link key={`inv-${i.id}`} href="/admin/ops/orders" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 14px", background: "#fff", border: `1.5px solid ${AMBER}`, borderRadius: 12, textDecoration: "none", color: "var(--ink)", fontSize: 13, fontWeight: 700 }}>
                      <span>{L.overdueRow(i.customerRef ?? i.number ?? "B2B", rupiah(i.amount))}</span>
                      <span style={{ color: "var(--soft)" }} aria-hidden>›</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* 4. Grouped alert cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 12 }}>
                {reorder.length > 0 && (
                  <AlertCard
                    title={L.reorderTitle}
                    border="rgba(226,64,38,0.35)"
                    actions={<>
                      <Link href="/admin/ops/receive" style={pillSolid}>{L.createPO}</Link>
                      <Link href="/admin/ops/stock" style={pillGhost}>{L.openStock}</Link>
                    </>}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {reorder.map((a) => (
                        <span key={a.itemId} style={{ display: "inline-flex", gap: 5, padding: "4px 10px", borderRadius: 999, background: "var(--surface2)", border: "1.5px solid var(--line)", fontSize: 12, fontWeight: 700 }}>
                          {a.name} <span style={{ color: "var(--red)", fontWeight: 900 }}>{a.qtyOnHand} {a.unit}</span>
                        </span>
                      ))}
                    </div>
                  </AlertCard>
                )}

                {worstMargin && (
                  <AlertCard
                    title={L.marginTitle}
                    border={AMBER}
                    actions={<Link href="/admin/ops/pricing" style={pillSolid}>{L.reviewPricing}</Link>}
                  >
                    {L.marginBody(worstMargin.name, `${(worstMargin.margin * 100).toFixed(1)}%`, `${floorPct}%`, rupiah(worstMargin.floorPrice))}
                    {belowFloor.length > 1 && <span style={{ color: "var(--soft)" }}>{L.marginMore(belowFloor.length - 1)}</span>}
                  </AlertCard>
                )}

                {soonestExpiring && (
                  <AlertCard
                    title={L.expiryTitle}
                    border={AMBER}
                    actions={<Link href="/admin/ops/production" style={pillSolid}>{L.planBake}</Link>}
                  >
                    {L.expiryBody(soonestExpiring.item, soonestExpiring.daysLeft < 0 ? L.expiredWord : L.daysLeft(soonestExpiring.daysLeft))}
                  </AlertCard>
                )}
              </div>
            </>
          )}
        </div>

        {/* 5. Prep banner → Board */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", background: "var(--choco)", borderRadius: 16, color: "var(--on-dark)" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{L.prepBanner(preparingCount, pickupsToday)}</div>
          <Link href="/admin/ops/board" style={{ padding: "9px 16px", borderRadius: 999, background: "var(--orange)", color: "#241503", fontSize: 13, fontWeight: 900, textDecoration: "none" }}>{L.openBoard}</Link>
        </div>

        {/* 6. Operational counts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <Stat label={L.openBatches} value={String(batches.length)} />
          <Stat label={L.lowStock} value={String(reorder.length)} tone={reorder.length ? "var(--red)" : "var(--ink)"} />
          <Stat label={L.ar} value={rupiah(arTotal)} tone={overdue.length ? AMBER : "var(--ink)"} />
          <Stat label={L.waste30} value={rupiah(wasteValue)} tone={wasteValue ? "var(--red)" : "var(--ink)"} />
        </div>
      </div>
    </OpsShell>
  );
}
