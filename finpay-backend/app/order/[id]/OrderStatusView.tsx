"use client";

/**
 * All interactive/timed rendering for the order status page: the ?from=
 * redirect-return screens (success/fail/pending), the waiting-payment
 * countdown, the post-payment pickup timeline, and terminal states.
 * The server page (page.tsx) only fetches the order and passes plain data in.
 *
 * v1 = PICKUP (E2E PRD §1a): timeline is Paid → Baking → Ready for pickup →
 * Picked up; no "out for delivery"/"delivered".
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order, OrderStatus } from "@/lib/orders";
import { PICKUP_LOCATION, SUPPORT_WHATSAPP } from "@/lib/fulfillment";
import { formatPickupDate } from "@/lib/pickupDate";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function pickupDateLabel(order: Order): string | null {
  return order.pickup_date ? formatPickupDate(order.pickup_date) : null;
}

function useCountdown(expiryIso: string | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!expiryIso) return;
    const tick = () => setRemainingMs(new Date(expiryIso).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryIso]);
  if (remainingMs === null) return null;
  const clamped = Math.max(0, remainingMs);
  const mins = Math.floor(clamped / 60000);
  const secs = Math.floor((clamped % 60000) / 1000);
  return { text: `${mins}:${String(secs).padStart(2, "0")}`, expired: remainingMs <= 0 };
}

function SupportLink() {
  return (
    <a
      href={`https://wa.me/${SUPPORT_WHATSAPP}`}
      target="_blank"
      rel="noreferrer"
      className="btn-outline"
      style={{ width: "100%", textAlign: "center", textDecoration: "none", display: "block" }}
    >
      Problem with your order? WhatsApp us
    </a>
  );
}

// Single-axis pickup timeline (E2E PRD §3, README §8).
const TIMELINE: { key: OrderStatus; label: string; icon: string }[] = [
  { key: "PAID", label: "Paid", icon: "✓" },
  { key: "BAKING", label: "Baking — in progress", icon: "🧑‍🍳" },
  { key: "READY_FOR_PICKUP", label: "Ready for pickup 🛍️", icon: "🛍️" },
  { key: "PICKED_UP", label: "Picked up", icon: "✓" },
];

function OrderTimeline({ status }: { status: OrderStatus }) {
  const currentIndex = TIMELINE.findIndex((s) => s.key === status);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {TIMELINE.map((node, i) => {
        const nodeState = i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
        // At the terminal PICKED_UP node, show it done rather than pulsing.
        const resolved = status === "PICKED_UP" && i === currentIndex ? "done" : nodeState;
        const isLast = i === TIMELINE.length - 1;
        return (
          <div key={node.key} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: resolved === "upcoming" ? "var(--surface2)" : resolved === "active" ? "var(--orange)" : "var(--green)",
                  border: resolved === "upcoming" ? "1.5px solid var(--line)" : "none",
                  color: resolved === "upcoming" ? undefined : "#fff",
                  animation: resolved === "active" ? "pulseGlow 1.6s ease-in-out infinite" : undefined,
                }}
              >
                {resolved === "done" ? "✓" : resolved === "active" ? node.icon : ""}
              </div>
              {!isLast && <div style={{ width: 2, flex: 1, background: resolved === "upcoming" ? "var(--line)" : "var(--green)" }} />}
            </div>
            <div
              style={{
                paddingBottom: isLast ? 0 : 20,
                fontSize: 13.5,
                fontWeight: resolved === "active" ? 800 : resolved === "done" ? 700 : 400,
                color: resolved === "upcoming" ? "var(--soft)" : resolved === "active" ? "var(--orange)" : undefined,
              }}
            >
              {node.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PickupCard({ order }: { order: Order }) {
  const label = pickupDateLabel(order);
  return (
    <div style={{ padding: 14, borderRadius: 16, background: "var(--surface)", border: "1.5px solid var(--line)", display: "flex", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: "#fff3e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🛍️</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em" }}>PICK UP AT</div>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{PICKUP_LOCATION.name}</div>
        <div style={{ fontSize: 13, color: "var(--soft)" }}>{PICKUP_LOCATION.address}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--choco)", marginTop: 2 }}>{PICKUP_LOCATION.hours}</div>
        {label && <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>Collect on {label}</div>}
      </div>
    </div>
  );
}

function ItemsSummary({ order }: { order: Order }) {
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  return (
    <div style={{ fontSize: 13, color: "var(--soft)" }}>
      {itemCount} items · {rupiah(order.amount)} · pickup at {PICKUP_LOCATION.name}
    </div>
  );
}

const TERMINAL_COPY: Record<string, { icon: string; title: string; blurb: string }> = {
  EXPIRED: { icon: "⏱", title: "Expired", blurb: "Payment window closed — order auto-cancelled" },
  CANCELLED: { icon: "✕", title: "Cancelled", blurb: "You cancelled this order" },
  REFUNDED: { icon: "⏩", title: "Refunded", blurb: `Refunded to your original payment method` },
};

const ACTIVE_PICKUP: OrderStatus[] = ["PAID", "BAKING", "READY_FOR_PICKUP"];

export default function OrderStatusView({ order, from }: { order: Order; from: string | null }) {
  const countdown = useCountdown(order.status === "PENDING" ? order.expiry_link : null);
  const dateLabel = pickupDateLabel(order);

  // --- Redirect-return screens (presentational only; DB status is the truth) ---
  if (from === "success" && (order.status === "PENDING" || order.status === "PAID")) {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>✓</div>
        <div className="font-display" style={{ fontSize: 22 }}>Yes! Order confirmed 🎉</div>
        {dateLabel && <div style={{ fontSize: 14, color: "var(--soft)" }}>Ready to collect on {dateLabel}</div>}
        <div style={{ width: "100%", maxWidth: 320 }}><PickupCard order={order} /></div>
        <div className="pill" style={{ background: "var(--surface2)", border: "1.5px solid var(--line)", color: "var(--ink)" }}>#{order.id}</div>
        <Link href={`/order/${order.id}`} className="btn-primary" style={{ marginTop: 10, width: "100%", textAlign: "center", textDecoration: "none" }}>View order</Link>
        <Link href="/" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>Back to shop</Link>
      </main>
    );
  }

  if (from === "fail") {
    return (
      <main className="screen-shell" style={{ background: "var(--surface)", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--tint-error)", border: "1.5px solid rgba(226,64,38,0.3)", color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>✕</div>
        <div className="font-display" style={{ fontSize: 19, color: "var(--choco)" }}>Payment didn&apos;t go through</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 260, lineHeight: 1.5 }}>
          No charge was made. Your cart and pickup date are saved — give it another go.
        </div>
        <div className="pill" style={{ background: "var(--surface2)", border: "1.5px solid var(--line)", color: "var(--ink)" }}>
          #{order.id} · {rupiah(order.amount)}
        </div>
        {order.status === "PENDING" && order.redirect_url && (
          <a href={order.redirect_url} className="btn-calm" style={{ marginTop: 8, textAlign: "center", textDecoration: "none" }}>Retry payment</a>
        )}
        <Link href="/" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>Back to cart</Link>
      </main>
    );
  }

  if (from === "back" && order.status === "PENDING") {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--tint-amber)", border: "1.5px solid rgba(245,140,33,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>⏳</div>
        <div className="font-display" style={{ fontSize: 19 }}>Payment still pending</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 260, lineHeight: 1.5 }}>
          Looks like the payment window was closed. Finish paying before it expires to lock in your slot.
        </div>
        {countdown && (
          <div className="pill" style={{ background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--choco)" }}>
            {countdown.expired ? "Expired" : `Expires in ${countdown.text}`}
          </div>
        )}
        {order.redirect_url && !countdown?.expired && (
          <a href={order.redirect_url} className="btn-primary" style={{ marginTop: 8, textAlign: "center", textDecoration: "none" }}>Complete payment</a>
        )}
        <Link href={`/order/${order.id}`} style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>View order status</Link>
      </main>
    );
  }

  // --- Persistent order-detail view (direct visits, My Orders, etc.) ---
  const isTerminalNonPaid: OrderStatus[] = ["EXPIRED", "CANCELLED", "REFUNDED"];

  return (
    <main className="screen-shell">
      <div className="top-bar">
        <Link href="/orders" className="icon-btn">‹</Link>
        <div className="font-display" style={{ fontSize: 16.5 }}>Order #{order.id}</div>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1, overflow: "auto" }}>
        {order.status === "PENDING" && (
          <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1.5px solid var(--line)", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em" }}>WAITING PAYMENT</div>
            {countdown && (
              <div className="font-display" style={{ fontSize: 26, margin: "8px 0", color: "var(--choco)" }}>
                {countdown.expired ? "Expired" : countdown.text}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--soft)" }}>Complete payment before it expires</div>
            {order.redirect_url && !countdown?.expired && (
              <a href={order.redirect_url} className="btn-calm" style={{ marginTop: 12, textAlign: "center", textDecoration: "none", display: "block" }}>Complete payment</a>
            )}
          </div>
        )}

        {ACTIVE_PICKUP.includes(order.status) && (
          <>
            {order.status === "READY_FOR_PICKUP" ? (
              <div style={{ padding: 14, borderRadius: 16, background: "var(--tint-success)", border: "1.5px solid rgba(45,147,34,0.3)" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--green)" }}>🛍️ Ready to collect{dateLabel ? ` — on ${dateLabel}` : ""}</div>
                <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>Baked fresh to order · {PICKUP_LOCATION.name}</div>
              </div>
            ) : (
              <div style={{ padding: 14, borderRadius: 16, background: "var(--tint-amber)", border: "1.5px solid rgba(245,140,33,0.3)" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--choco)" }}>🧑‍🍳 Collect your box{dateLabel ? ` on ${dateLabel}` : ""}</div>
                <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>Baked fresh to order · {PICKUP_LOCATION.name}</div>
              </div>
            )}
            <OrderTimeline status={order.status} />
            <PickupCard order={order} />
            <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12 }}><ItemsSummary order={order} /></div>
            <SupportLink />
          </>
        )}

        {order.status === "PICKED_UP" && (
          <>
            <div style={{ padding: 14, borderRadius: 16, background: "var(--tint-success)", border: "1.5px solid rgba(45,147,34,0.3)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--green)" }}>✓ Picked up — enjoy every bite! 🍪</div>
            </div>
            <OrderTimeline status={order.status} />
            <button className="btn-primary">Order these again</button>
            <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12 }}><ItemsSummary order={order} /></div>
            <SupportLink />
          </>
        )}

        {isTerminalNonPaid.includes(order.status) && (
          <>
            <div style={{ padding: 14, borderRadius: 16, background: "var(--surface2)", border: "1.5px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: order.status === "REFUNDED" ? "var(--blue)" : "var(--line)", color: order.status === "REFUNDED" ? "#fff" : undefined, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                {TERMINAL_COPY[order.status].icon}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{TERMINAL_COPY[order.status].title}</div>
                <div style={{ fontSize: 12, color: "var(--soft)" }}>
                  {order.status === "REFUNDED" ? `${rupiah(order.amount)} refunded to your original payment method` : TERMINAL_COPY[order.status].blurb}
                </div>
              </div>
            </div>
            <SupportLink />
          </>
        )}
      </div>
    </main>
  );
}
