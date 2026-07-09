/**
 * Website pickup queue — the storefront orders that need fulfilling, read live
 * from public.orders (source of truth). Grouped by pickup date; each card opens
 * the unified ops order detail where the real lifecycle actions live (advance →
 * customer email, cancel/refund → Finpay). Purely presentational server render.
 */
import Link from "next/link";
import type { Order } from "@/lib/orders";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function groupLabel(dateStr: string | null, today: string, tomorrow: string): string {
  if (!dateStr) return "NO DATE SET";
  if (dateStr === today) return "TODAY";
  if (dateStr === tomorrow) return "TOMORROW";
  return dateStr > tomorrow ? "UPCOMING" : "PAST DUE";
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "Paid — start baking",
  BAKING: "Baking",
  READY_FOR_PICKUP: "Ready for pickup",
};

const GROUP_ORDER = ["PAST DUE", "TODAY", "TOMORROW", "UPCOMING", "NO DATE SET"];

export default function WebsitePickupQueue({
  active,
  expired,
  today,
  tomorrow,
}: {
  active: Order[];
  expired: Order[];
  today: string;
  tomorrow: string;
}) {
  const groups = new Map<string, Order[]>();
  for (const o of [...active].sort((a, b) => (a.pickup_date ?? "").localeCompare(b.pickup_date ?? ""))) {
    const label = groupLabel(o.pickup_date, today, tomorrow);
    groups.set(label, [...(groups.get(label) ?? []), o]);
  }

  if (active.length === 0 && expired.length === 0) {
    return (
      <div style={{ padding: "36px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
        <div style={{ fontSize: 28 }}>🎉</div>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>No website orders need attention</div>
        <div style={{ fontSize: 12.5, color: "var(--soft)" }}>Paid storefront pickups will land here automatically.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
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
                  href={`/admin/ops/orders/${o.id}`}
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
  );
}
