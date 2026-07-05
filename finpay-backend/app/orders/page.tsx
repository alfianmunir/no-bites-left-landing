import Link from "next/link";
import { getSession } from "@/lib/session";
import { getSupabaseUser } from "@/lib/supabase/server";
import { getStore } from "@/lib/db";
import type { Order } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const CHIP: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: "var(--tint-amber)", color: "var(--choco)", label: "Waiting payment" },
  PAID: { bg: "#fff3e2", color: "var(--choco)", label: "Paid" },
  BAKING: { bg: "#fff3e2", color: "var(--choco)", label: "Baking" },
  READY_FOR_PICKUP: { bg: "var(--tint-amber)", color: "var(--choco)", label: "Ready for pickup" },
  PICKED_UP: { bg: "#e9f5e7", color: "var(--green)", label: "Picked up" },
  EXPIRED: { bg: "var(--surface2)", color: "var(--soft)", label: "Expired" },
  CANCELLED: { bg: "var(--surface2)", color: "var(--soft)", label: "Cancelled" },
  REFUNDED: { bg: "#e8f6ff", color: "var(--blue)", label: "Refunded" },
};

function chipFor(order: Order) {
  return CHIP[order.status] ?? CHIP.PENDING;
}

export default async function MyOrdersPage() {
  const authUser = await getSupabaseUser();
  const legacy = authUser ? null : await getSession();
  const session = authUser ? { id: authUser.id } : legacy;

  if (!session) {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
        <div className="font-display" style={{ fontSize: 19 }}>No orders yet</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 230 }}>
          Sign in during checkout to start tracking orders here.
        </div>
        <Link href="/" className="btn-primary" style={{ width: "auto", padding: "13px 26px", textDecoration: "none" }}>Start an order</Link>
      </main>
    );
  }

  const store = getStore();
  await store.init();
  const orders = await store.list({ userId: session.id });

  return (
    <main className="screen-shell">
      <div className="top-bar">
        <Link href="/" className="icon-btn">‹</Link>
        <div className="font-display" style={{ fontSize: 19 }}>My Orders</div>
      </div>

      {orders.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              background: "repeating-linear-gradient(45deg, var(--surface2), var(--surface2) 6px, var(--surface) 6px, var(--surface) 12px)",
              border: "1.5px solid var(--line)",
            }}
          />
          <div className="font-display" style={{ fontSize: 19 }}>No orders yet</div>
          <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 230 }}>Your first batch is just a few taps away.</div>
          <Link href="/" className="btn-primary" style={{ width: "auto", padding: "13px 26px", textDecoration: "none" }}>Start an order</Link>
        </div>
      ) : (
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
          {orders.map((o) => {
            const chip = chipFor(o);
            return (
              <Link
                key={o.id}
                href={`/order/${o.id}`}
                className="card"
                style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "inherit" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                    #{o.id} · {o.items.reduce((s, i) => s + i.qty, 0)} items
                  </div>
                  <div style={{ fontSize: 12, color: "var(--soft)" }}>
                    {o.pickup_date ? `Pickup ${o.pickup_date}` : rupiah(o.amount)}
                  </div>
                </div>
                <div className="pill" style={{ background: chip.bg, color: chip.color }}>{chip.label}</div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
