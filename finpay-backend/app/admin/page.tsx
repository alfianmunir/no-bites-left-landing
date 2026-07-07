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
  // Active pickup queue = paid + in production, grouped by pickup date (PRD §5.2).
  const [paid, baking, ready, expired] = await Promise.all([
    store.list({ status: "PAID" }),
    store.list({ status: "BAKING" }),
    store.list({ status: "READY_FOR_PICKUP" }),
    store.list({ status: "EXPIRED" }),
  ]);
  const active = [...paid, ...baking, ...ready];

  const STATUS_LABEL: Record<string, string> = {
    PAID: "Paid — start baking",
    BAKING: "Baking",
    READY_FOR_PICKUP: "Ready for pickup",
  };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const groups = new Map<string, Order[]>();
  for (const o of active.sort((a, b) => (a.pickup_date ?? "").localeCompare(b.pickup_date ?? ""))) {
    const label = groupLabel(o.pickup_date, today, tomorrow);
    groups.set(label, [...(groups.get(label) ?? []), o]);
  }
  const groupOrder = ["PAST DUE", "TODAY", "TOMORROW", "UPCOMING", "NO DATE SET"];

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)" }}>
      <div style={{ padding: "18px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "var(--choco)" }}>Pickup queue</div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/admin/ops/today" style={{ fontSize: 13, fontWeight: 800, color: "var(--choco)", textDecoration: "none" }}>Ops →</Link>
          <Link href="/admin/wholesale" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>Wholesale →</Link>
          <Link href="/admin/bake-sheet" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>Bake sheet →</Link>
        </div>
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
                  {groups.get(g)!.map((o) => {
                    const isNew = o.status === "PAID"; // needs ack until an admin advances it
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
                          {o.customer.firstName} {o.customer.lastName} · {o.customer.mobilePhone}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--soft)" }}>
                          {o.items.reduce((s, it) => s + it.qty, 0)} items{o.pickup_date ? ` · pickup ${o.pickup_date}` : ""}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "var(--choco)" }}>
                          {STATUS_LABEL[o.status] ?? o.status}
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
