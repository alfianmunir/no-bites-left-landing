import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, getDemandVelocity, getPurchasePlan, get13WeekCash } from "@/lib/opsStore";
import { OpsShell, DbNotice, rupiah, qty } from "../OpsChrome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, color: "var(--ink)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };

export default async function OpsForecastPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/forecast" title="Forecast">
        <DbNotice />
      </OpsShell>
    );
  }

  const [demand, plan, cash] = await Promise.all([getDemandVelocity(28), getPurchasePlan(), get13WeekCash()]);
  const shortItems = plan.filter((r) => r.short > 0);
  const firstNegative = cash.weeks.find((w) => w.balance < 0);

  return (
    <OpsShell active="/admin/ops/forecast" title="Forecast" subtitle="Demand · purchase plan · 13-week cash">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Demand velocity */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>DEMAND · LAST 28 DAYS</div>
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
              <thead><tr><th style={th}>Product</th><th style={{ ...th, textAlign: "right" }}>Units</th><th style={{ ...th, textAlign: "right" }}>Revenue</th></tr></thead>
              <tbody>
                {demand.map((d) => (
                  <tr key={d.sku}>
                    <td style={{ ...td, fontWeight: 700 }}>{d.name} <span style={{ color: "var(--soft)", fontWeight: 500 }}>{d.sku}</span></td>
                    <td style={{ ...td, textAlign: "right" }}>{qty(d.units)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{rupiah(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {demand.every((d) => d.units === 0) && (
            <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 6 }}>No sales in the window yet — this fills in as orders are recorded.</div>
          )}
        </div>

        {/* Purchase plan */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>
            PURCHASE PLAN · one batch of each recipe · {shortItems.length} to buy
          </div>
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
              <thead><tr><th style={th}>Ingredient</th><th style={{ ...th, textAlign: "right" }}>Need</th><th style={{ ...th, textAlign: "right" }}>On hand</th><th style={{ ...th, textAlign: "right" }}>Buy</th></tr></thead>
              <tbody>
                {plan.map((r) => (
                  <tr key={r.name} style={{ background: r.short > 0 ? "#fdecec" : "transparent" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--soft)" }}>{qty(r.need)} {r.unit}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--soft)" }}>{qty(r.onHand)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: r.short > 0 ? "var(--red)" : "var(--soft)" }}>{r.short > 0 ? `${qty(r.short)} ${r.unit}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 13-week cash */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>
            13-WEEK CASH · from {rupiah(cash.startBalance)}{firstNegative ? ` · ⚠ negative wk of ${firstNegative.weekStart}` : ""}
          </div>
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
              <thead><tr><th style={th}>Week</th><th style={{ ...th, textAlign: "right" }}>In</th><th style={{ ...th, textAlign: "right" }}>Out</th><th style={{ ...th, textAlign: "right" }}>Balance</th></tr></thead>
              <tbody>
                {cash.weeks.map((w) => (
                  <tr key={w.weekStart}>
                    <td style={{ ...td, color: "var(--soft)" }}>{w.weekStart}</td>
                    <td style={{ ...td, textAlign: "right", color: w.inflow ? "var(--green)" : "var(--soft)" }}>{w.inflow ? rupiah(w.inflow) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--soft)" }}>{rupiah(w.outflow)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: w.balance < 0 ? "var(--red)" : "var(--ink)" }}>{rupiah(w.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--soft)", marginTop: 6 }}>
            Projection: recurring expenses + payroll run-rate (spread weekly) − AR due dates + planned capex. Refines as real cashflow accrues.
          </div>
        </div>
      </div>
    </OpsShell>
  );
}
