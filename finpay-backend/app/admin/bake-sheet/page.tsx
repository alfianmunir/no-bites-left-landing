import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { getPriceItem } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BakeSheetPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  if (!(await isAdminSession())) redirect("/admin/login");

  const { date } = await searchParams;
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const store = getStore();
  await store.init();
  // Everything not-yet-collected for the target pickup date (PRD §5.4).
  const [paid, baking, ready] = await Promise.all([
    store.list({ status: "PAID" }),
    store.list({ status: "BAKING" }),
    store.list({ status: "READY_FOR_PICKUP" }),
  ]);
  const orders = [...paid, ...baking, ...ready].filter((o) => o.pickup_date === targetDate);

  const qtyBySku = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.items) {
      qtyBySku.set(item.sku, (qtyBySku.get(item.sku) ?? 0) + item.qty);
    }
  }
  const rows = [...qtyBySku.entries()]
    .map(([sku, qty]) => ({ sku, qty, label: getPriceItem(sku) ? `${getPriceItem(sku)!.name} · ${getPriceItem(sku)!.variant}` : sku }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const totalUnits = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px 6px", background: "#fff", borderBottom: "1.5px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/admin" className="icon-btn">‹</Link>
          <div style={{ fontWeight: 900, fontSize: 17, color: "var(--choco)" }}>Bake Sheet</div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>{targetDate} · {orders.length} order(s)</div>
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--soft)", fontSize: 13.5, padding: 40 }}>No paid orders scheduled for this date.</div>
        ) : (
          rows.map((r) => (
            <div key={r.sku} style={{ display: "flex", justifyContent: "space-between", padding: 12, background: "#fff", border: "1.5px solid var(--line)", borderRadius: 12, fontSize: 13.5 }}>
              <span>{r.label}</span>
              <span style={{ fontWeight: 900 }}>{r.qty}×</span>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: "14px 20px 20px", borderTop: "1.5px solid var(--line)", background: "#fff", fontWeight: 800, fontSize: 14, display: "flex", justifyContent: "space-between" }}>
        <span>Total units</span>
        <span>{totalUnits}</span>
      </div>
    </main>
  );
}
