/**
 * /admin/ops/bake-sheet — kitchen bake sheet inside the ops menu. Aggregates
 * every not-yet-collected website order's menu SKUs for a target pickup date
 * (PAID / BAKING / READY_FOR_PICKUP), so the kitchen knows exactly what to bake.
 * Reads public.orders directly (source of truth) — works with or without the
 * ops DB, and needs no menu mapping.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { getPriceItem } from "@/lib/prices";
import { OpsShell } from "../OpsChrome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addDays(dateISO: string, days: number): string {
  return new Date(new Date(`${dateISO}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

export default async function OpsBakeSheetPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  if (!(await isAdminSession())) redirect("/admin/login");

  const { date } = await searchParams;
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const store = getStore();
  await store.init();
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

  const prevDate = addDays(targetDate, -1);
  const nextDate = addDays(targetDate, 1);

  return (
    <OpsShell active="/admin/ops/bake-sheet" title="Bake sheet" subtitle={`${targetDate} · ${orders.length} order(s)`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
        <Link href={`/admin/ops/bake-sheet?date=${prevDate}`} className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, textDecoration: "none" }}>‹ {prevDate}</Link>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>{targetDate}</div>
        <Link href={`/admin/ops/bake-sheet?date=${nextDate}`} className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, textDecoration: "none" }}>{nextDate} ›</Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

      {rows.length > 0 && (
        <div style={{ marginTop: 14, padding: "14px 16px", borderTop: "1.5px solid var(--line)", background: "#fff", borderRadius: 12, fontWeight: 800, fontSize: 14, display: "flex", justifyContent: "space-between" }}>
          <span>Total units</span>
          <span>{totalUnits}</span>
        </div>
      )}
    </OpsShell>
  );
}
