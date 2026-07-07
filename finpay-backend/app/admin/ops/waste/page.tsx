import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listItems, listProducts, listWaste30d } from "@/lib/opsStore";
import { OpsShell, DbNotice, rupiah, qty } from "../OpsChrome";
import WasteForm from "./WasteForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsWastePage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/waste" title="Waste">
        <DbNotice />
      </OpsShell>
    );
  }

  const [items, products, waste] = await Promise.all([listItems(), listProducts(), listWaste30d()]);
  const wasteTotal = waste.reduce((s, w) => s + w.wasteValue, 0);

  return (
    <OpsShell active="/admin/ops/waste" title="Waste" subtitle="Record spoilage & failed bakes — writes off cost from the ledger">
      <WasteForm items={items} products={products} />

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>
          LAST 30 DAYS · {rupiah(wasteTotal)} written off
        </div>
        {waste.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--soft)", fontSize: 13.5, background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
            No waste recorded in the last 30 days. 🎉
          </div>
        ) : (
          <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)" }}>Item</th>
                  <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {waste.map((w) => (
                  <tr key={w.name}>
                    <td style={{ padding: "10px 12px", fontSize: 13.5, color: "var(--ink)", borderBottom: "1px solid var(--line)", fontWeight: 700 }}>{w.name}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13.5, color: "var(--soft)", borderBottom: "1px solid var(--line)", textAlign: "right" }}>{qty(w.qtyWasted)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13.5, color: "var(--red)", borderBottom: "1px solid var(--line)", textAlign: "right", fontWeight: 800 }}>{rupiah(w.wasteValue)}</td>
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
