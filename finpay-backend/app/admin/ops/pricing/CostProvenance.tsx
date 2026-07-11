import type { ProductCosting } from "@/lib/opsStore";
import { rupiah } from "../OpsChrome";

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const th: React.CSSProperties = { textAlign: "right", fontSize: 11, fontWeight: 900, color: "var(--soft)", letterSpacing: "0.03em", textTransform: "uppercase", padding: "0 10px 8px" };
const td: React.CSSProperties = { textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--ink)", padding: "9px 10px", borderTop: "1px solid var(--line)" };

/** Cost provenance (Audit H4): shows whether each product's std_cost — which the
 *  margin-floor guardrail runs on — is backed by real bakes or is still the
 *  Notion seed. */
export default function CostProvenance({ rows }: { rows: ProductCosting[] }) {
  const seeded = rows.filter((r) => r.bakes === 0 && r.stdCost != null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--soft)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Cost provenance
      </div>
      {seeded.length > 0 && (
        <div style={{ ...card, padding: "11px 14px", background: "#fff6e8", border: "1.5px solid #d98b1e", color: "#7a4d0b", fontSize: 12.5, fontWeight: 700 }}>
          {seeded.length} product{seeded.length === 1 ? "" : "s"} still priced off the seed cost (never baked in-system) — margin guardrail is on an unverified cost: {seeded.map((s) => s.sku).join(", ")}.
        </div>
      )}
      <div style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Product</th>
              <th style={th}>std_cost</th>
              <th style={th}>Last bake</th>
              <th style={th}>Trailing-3 avg</th>
              <th style={th}>Bakes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId}>
                <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>
                  {r.name} <span style={{ color: "var(--soft)", fontWeight: 700 }}>{r.sku}</span>
                </td>
                <td style={td}>{r.stdCost == null ? "—" : rupiah(r.stdCost)}</td>
                <td style={td}>
                  {r.lastBakeCost == null ? <span style={{ color: "var(--soft)" }}>—</span> : rupiah(r.lastBakeCost)}
                </td>
                <td style={td}>{r.trailing3Avg == null ? "—" : rupiah(r.trailing3Avg)}</td>
                <td style={{ ...td, color: r.bakes === 0 ? "#d98b1e" : "var(--ink)", fontWeight: 900 }}>
                  {r.bakes === 0 ? "seed" : r.bakes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
