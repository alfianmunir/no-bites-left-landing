import { redirect } from "next/navigation";
import { isOpsUser } from "@/lib/adminAuth";
import { opsEnabled, listStockBalance, listProductOpnameChoices, listOpnameAdjustments, type OpnameCategory } from "@/lib/opsStore";
import { OpsShell, DbNotice, rupiah, qty } from "../OpsChrome";
import OpnameForm from "./OpnameForm";
import ProductOpnameForm from "./ProductOpnameForm";

const sectionLabel: React.CSSProperties = { fontSize: 12.5, fontWeight: 900, letterSpacing: "0.02em", color: "var(--choco)", marginBottom: 8 };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAT: Record<OpnameCategory, { label: string; color: string; tint: string }> = {
  surplus: { label: "Surplus", color: "var(--green)", tint: "var(--tint-success)" },
  loss: { label: "Loss", color: "var(--red)", tint: "var(--tint-error)" },
  equal: { label: "Equal", color: "var(--soft)", tint: "var(--surface2)" },
};

const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "var(--ink)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };

export default async function OpsOpnamePage() {
  if (!(await isOpsUser())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/opname" title="Stock opname">
        <DbNotice />
      </OpsShell>
    );
  }

  const [balance, products, adjustments] = await Promise.all([listStockBalance(), listProductOpnameChoices(), listOpnameAdjustments()]);

  // Surplus / loss / equal breakdown: count of adjustments + summed value per bucket.
  const summary = { surplus: { n: 0, value: 0 }, loss: { n: 0, value: 0 }, equal: { n: 0, value: 0 } };
  for (const a of adjustments) {
    summary[a.category].n += 1;
    summary[a.category].value += a.value;
  }
  const netValue = summary.surplus.value + summary.loss.value; // equal contributes 0

  return (
    <OpsShell active="/admin/ops/opname" title="Stock opname" subtitle="Count stock — the variance posts as a surplus / loss / equal adjustment">
      <div style={sectionLabel}>🧺 Ingredients &amp; packaging</div>
      <OpnameForm balance={balance} />

      <div style={{ ...sectionLabel, marginTop: 22 }}>🥐 Finished goods</div>
      <ProductOpnameForm products={products} />

      {/* Surplus / loss / equal summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        {(["surplus", "loss", "equal"] as OpnameCategory[]).map((c) => (
          <div key={c} style={{ flex: "1 1 150px", minWidth: 140, background: "#fff", border: `1.5px solid var(--line)`, borderRadius: 16, padding: 14, borderLeft: `4px solid ${CAT[c].color}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", textTransform: "uppercase" }}>{CAT[c].label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)", marginTop: 4 }}>{summary[c].n}</div>
            {c !== "equal" && <div style={{ fontSize: 12.5, fontWeight: 700, color: CAT[c].color }}>{c === "loss" ? "−" : "+"}{rupiah(Math.abs(summary[c].value))}</div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "var(--soft)", marginTop: 8 }}>
        Net stock variance value <strong style={{ color: netValue < 0 ? "var(--red)" : "var(--ink)" }}>{netValue < 0 ? "−" : "+"}{rupiah(Math.abs(netValue))}</strong>
      </div>

      {/* All adjustments */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>ALL ADJUSTMENTS · {adjustments.length}</div>
        {adjustments.length === 0 ? (
          <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No opname counts recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Item</th>
                  <th style={th}>Kind</th>
                  <th style={th}>Type</th>
                  <th style={{ ...th, textAlign: "right" }}>Variance</th>
                  <th style={{ ...th, textAlign: "right" }}>Value</th>
                  <th style={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...td, color: "var(--soft)", fontSize: 12.5 }}>{a.at.slice(0, 10)}</td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "normal" }}>{a.name}</td>
                    <td style={td}>
                      <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.04em", color: "var(--soft)", textTransform: "uppercase" }}>{a.kind === "product" ? "FG" : "ING"}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: CAT[a.category].color, borderRadius: 999, padding: "2px 9px" }}>{CAT[a.category].label}</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: CAT[a.category].color }}>
                      {a.qty > 0 ? "+" : ""}{qty(a.qty)} <span style={{ color: "var(--soft)", fontWeight: 400, fontSize: 12 }}>{a.unit}</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{a.value === 0 ? "—" : `${a.value < 0 ? "−" : "+"}${rupiah(Math.abs(a.value))}`}</td>
                    <td style={{ ...td, color: "var(--soft)", whiteSpace: "normal", fontSize: 12.5 }}>{a.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OpsShell>
  );
}
