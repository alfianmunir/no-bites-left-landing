import { redirect } from "next/navigation";
import { getOpsSession } from "@/lib/adminAuth";
import { opsEnabled, listStockBalance, listReorderAlerts, listExpiringLots, listFinishedGoodsBalance } from "@/lib/opsStore";
import { OpsShell, DbNotice, rupiah } from "../OpsChrome";
import StockTabs from "./StockTabs";

/** Stock quantities read cleaner rounded to 1 decimal (e.g. 31,5 g), trailing
 *  zero trimmed so whole counts stay whole (310, not 310,0). */
function qty(n: number): string {
  return Number(n.toFixed(1)).toLocaleString("id-ID");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13.5, color: "var(--ink)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };

export default async function OpsStockPage() {
  const session = await getOpsSession();
  if (!session) redirect("/admin/login");
  // Staff see quantity-on-hand only — no cost / valuation ("finance view").
  const staff = session.role === "staff";

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/stock" title="Stock">
        <DbNotice />
      </OpsShell>
    );
  }

  const [balance, alerts, expiring, finishedGoods] = await Promise.all([listStockBalance(), listReorderAlerts(), listExpiringLots(), listFinishedGoodsBalance()]);
  const totalValue = balance.reduce((s, r) => s + r.stockValue, 0);
  const fgValue = finishedGoods.reduce((s, r) => s + r.stockValue, 0);
  const subtitle = staff ? `${balance.length} items on hand` : `${balance.length} items · ${rupiah(totalValue)} ingredients · ${rupiah(fgValue)} finished goods`;

  return (
    <OpsShell active="/admin/ops/stock" title="Stock" subtitle={subtitle}>
      {(alerts.length > 0 || expiring.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {alerts.length > 0 && (
            <div style={{ padding: "12px 14px", background: "#fdecec", border: "1.5px solid var(--red)", borderRadius: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 13, color: "var(--red)", marginBottom: 6 }}>⚠ Reorder now · {alerts.length}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {alerts.map((a) => (
                  <div key={a.itemId} style={{ fontSize: 13, color: "var(--ink)" }}>
                    <strong>{a.name}</strong> — {qty(a.qtyOnHand)} {a.unit} left (reorder at {qty(a.reorderPoint)})
                  </div>
                ))}
              </div>
            </div>
          )}
          {expiring.length > 0 && (
            <div style={{ padding: "12px 14px", background: "#fff3e2", border: "1.5px solid var(--orange)", borderRadius: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 13, color: "var(--choco)", marginBottom: 6 }}>⏳ Expiring soon · {expiring.length}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {expiring.map((e) => (
                  <div key={e.lotId} style={{ fontSize: 13, color: "var(--ink)" }}>
                    <strong>{e.item}</strong> — {qty(e.qtyRemaining)} · {e.daysLeft < 0 ? `expired ${-e.daysLeft}d ago` : `${e.daysLeft}d left`} ({e.expiryDate})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <StockTabs
        ingredientsLabel={staff ? "Ingredients & packaging" : `Ingredients & packaging · ${rupiah(totalValue)}`}
        finishedGoodsLabel={staff ? "Finished goods" : `Finished goods · ${rupiah(fgValue)}`}
        ingredients={
          balance.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--soft)", fontSize: 14 }}>No stock on hand yet — receive a purchase to get started.</div>
          ) : (
            <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: staff ? 280 : 480 }}>
                <thead>
                  <tr>
                    <th style={th}>Item</th>
                    <th style={{ ...th, textAlign: "right" }}>On hand</th>
                    {!staff && <th style={{ ...th, textAlign: "right" }}>Avg cost</th>}
                    {!staff && <th style={{ ...th, textAlign: "right" }}>Value</th>}
                  </tr>
                </thead>
                <tbody>
                  {balance.map((r) => (
                    <tr key={r.itemId} style={{ background: r.belowReorder ? "#fdecec" : "transparent" }}>
                      <td style={{ ...td, whiteSpace: "normal", fontWeight: 700 }}>
                        {r.name}
                        {r.belowReorder && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 900, color: "var(--red)" }}>LOW</span>}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{qty(r.qtyOnHand)} <span style={{ color: "var(--soft)", fontSize: 12 }}>{r.unit}</span></td>
                      {!staff && <td style={{ ...td, textAlign: "right", color: "var(--soft)" }}>{rupiah(r.avgCost)}</td>}
                      {!staff && <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{rupiah(r.stockValue)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        finishedGoods={
          finishedGoods.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--soft)", fontSize: 14 }}>No products defined yet.</div>
          ) : (
            <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: staff ? 280 : 480 }}>
                <thead>
                  <tr>
                    <th style={th}>Product</th>
                    <th style={{ ...th, textAlign: "right" }}>On hand</th>
                    {!staff && <th style={{ ...th, textAlign: "right" }}>Made cost</th>}
                    {!staff && <th style={{ ...th, textAlign: "right" }}>Value</th>}
                  </tr>
                </thead>
                <tbody>
                  {finishedGoods.map((r) => {
                    const neg = r.qtyOnHand < -0.0001;
                    const zero = Math.abs(r.qtyOnHand) < 0.0001;
                    return (
                      <tr key={r.productId} style={{ background: neg ? "#fdecec" : "transparent" }}>
                        <td style={{ ...td, whiteSpace: "normal", fontWeight: 700 }}>
                          {r.name}
                          {neg && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 900, color: "var(--red)" }}>OVERSOLD</span>}
                        </td>
                        <td style={{ ...td, textAlign: "right", color: neg ? "var(--red)" : zero ? "var(--soft)" : "var(--ink)" }}>{qty(r.qtyOnHand)} <span style={{ color: "var(--soft)", fontSize: 12 }}>pcs</span></td>
                        {!staff && <td style={{ ...td, textAlign: "right", color: "var(--soft)" }}>{rupiah(r.avgCost)}</td>}
                        {!staff && <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{rupiah(r.stockValue)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      />
    </OpsShell>
  );
}
