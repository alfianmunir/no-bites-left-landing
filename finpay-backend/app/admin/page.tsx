import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import type { Order } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function groupLabel(dateStr: string | null, today: string, tomorrow: string): string {
  if (!dateStr) return "NO DATE SET";
  if (dateStr === today) return "TODAY";
  if (dateStr === tomorrow) return "TOMORROW";
  return dateStr > tomorrow ? "UPCOMING" : "PAST DUE";
}

export default async function AdminQueuePage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const store = getStore();
  await store.init();
  const [paid, expired] = await Promise.all([
    store.list({ status: "PAID" }),
    store.list({ status: "EXPIRED" }),
  ]);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const groups = new Map<string, Order[]>();
  for (const o of paid.sort((a, b) => (a.delivery_date ?? "").localeCompare(b.delivery_date ?? ""))) {
    const label = groupLabel(o.delivery_date, today, tomorrow);
    groups.set(label, [...(groups.get(label) ?? []), o]);
  }
  const groupOrder = ["PAST DUE", "TODAY", "TOMORROW", "UPCOMING", "NO DATE SET"];

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)" }}>
      <div style={{ padding: "18px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "var(--choco)" }}>Order Queue</div>
        <Link href="/admin/bake-sheet" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>Bake sheet →</Link>
      </div>

      {paid.length === 0 && expired.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 34 }}>🎉</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "var(--choco)" }}>All caught up</div>
          <div style={{ fontSize: 13.5, color: "var(--soft)" }}>No orders need attention right now.</div>
        </div>
      ) : (
        <div style={{ padding: "8px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {groupOrder
            .filter((g) => groups.has(g))
            .map((g) => (
              <div key={g}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 8 }}>
                  {g} · {groups.get(g)!.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groups.get(g)!.map((o, i) => {
                    const isNew = i === 0 && g !== "UPCOMING";
                    return (
                      <Link
                        key={o.id}
                        href={`/admin/orders/${o.id}`}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          background: "#fff",
                          border: isNew ? "2px solid var(--orange)" : "1.5px solid var(--line)",
                          position: "relative",
                          textDecoration: "none",
                          color: "inherit",
                          display: "block",
                        }}
                      >
                        {isNew && (
                          <div style={{ position: "absolute", top: -9, left: 12, background: "var(--orange)", color: "#fff", fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 999 }}>
                            NEW · PAID
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontWeight: 800, fontSize: 13.5 }}>#{o.id}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--green)" }}>{rupiah(o.amount)}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>
                          {o.delivery_address?.recipientName} · {o.delivery_address?.phone}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--soft)" }}>
                          {o.items.reduce((s, it) => s + it.qty, 0)} items · {o.courier?.name}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "var(--choco)" }}>
                          {o.fulfillment_stage === "out_for_delivery" ? "Out for delivery" : "Baking"}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

          {expired.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 8 }}>
                EXPIRED · {expired.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {expired.map((o) => (
                  <div key={o.id} style={{ padding: 12, borderRadius: 14, background: "#f2ede2", border: "1.5px dashed var(--line)", opacity: 0.7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5, color: "var(--soft)" }}>#{o.id}</span>
                      <span style={{ fontSize: 12, color: "var(--soft)" }}>{rupiah(o.amount)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>Auto-cancelled — payment expired</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
