"use client";

/**
 * All interactive/timed rendering for the order status page: the ?from=
 * redirect-return screens (success/fail/pending), the waiting-payment
 * countdown, the post-payment fulfillment timeline, and terminal states.
 * The server page (page.tsx) only fetches the order and passes plain data in.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Order, OrderStatus, FulfillmentStage } from "@/lib/orders";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
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
      href="https://wa.me/6281776376636"
      target="_blank"
      rel="noreferrer"
      className="btn-outline"
      style={{ width: "100%", textAlign: "center", textDecoration: "none", display: "block" }}
    >
      Problem with your order? WhatsApp us
    </a>
  );
}

const TIMELINE_STAGES: { key: FulfillmentStage; label: string; icon: string }[] = [
  { key: "baking", label: "Baking — in progress", icon: "🧑‍🍳" },
  { key: "out_for_delivery", label: "Out for delivery 🛵", icon: "🛵" },
  { key: "delivered", label: "Delivered", icon: "✅" },
];

function OrderTimeline({ stage }: { stage: FulfillmentStage }) {
  const stageIndex = TIMELINE_STAGES.findIndex((s) => s.key === stage);
  const nodes = [{ key: "paid", label: "Paid", icon: "✓" }, ...TIMELINE_STAGES];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {nodes.map((node, i) => {
        // "paid" (i===0) is always done; other nodes compare against stageIndex+1.
        const nodeState = i === 0 ? "done" : i <= stageIndex + 1 ? (i === stageIndex + 1 ? "active" : "done") : "upcoming";
        const isLast = i === nodes.length - 1;
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
                  background: nodeState === "upcoming" ? "var(--surface2)" : nodeState === "active" ? "var(--orange)" : "var(--green)",
                  border: nodeState === "upcoming" ? "1.5px solid var(--line)" : "none",
                  color: nodeState === "upcoming" ? undefined : "#fff",
                  animation: nodeState === "active" ? "pulseGlow 1.6s ease-in-out infinite" : undefined,
                }}
              >
                {nodeState === "done" ? "✓" : nodeState === "active" ? node.icon : ""}
              </div>
              {!isLast && <div style={{ width: 2, flex: 1, background: nodeState === "upcoming" ? "var(--line)" : "var(--green)" }} />}
            </div>
            <div
              style={{
                paddingBottom: isLast ? 0 : 20,
                fontSize: 13.5,
                fontWeight: nodeState === "active" ? 800 : nodeState === "done" ? 700 : 400,
                color: nodeState === "upcoming" ? "var(--soft)" : nodeState === "active" ? "var(--orange)" : undefined,
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

function ItemsSummary({ order }: { order: Order }) {
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  return (
    <div style={{ fontSize: 13, color: "var(--soft)" }}>
      {itemCount} items · {rupiah(order.amount)} · {order.delivery_address?.fullAddress ?? ""}
    </div>
  );
}

const TERMINAL_COPY: Record<string, { icon: string; title: string; blurb: string }> = {
  EXPIRED: { icon: "⏱", title: "Expired", blurb: "Payment window closed — order auto-cancelled" },
  CANCELLED: { icon: "✕", title: "Cancelled", blurb: "You cancelled this order" },
  REFUNDED: { icon: "⏩", title: "Refunded", blurb: `Refunded to your original payment method` },
};

export default function OrderStatusView({ order, from }: { order: Order; from: string | null }) {
  const countdown = useCountdown(order.status === "PENDING" ? order.expiry_link : null);

  // --- Redirect-return screens (presentational only; DB status is the truth) ---
  if (from === "success" && (order.status === "PENDING" || order.status === "PAID")) {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>✓</div>
        <div className="font-display" style={{ fontSize: 22 }}>Yes! Order confirmed 🎉</div>
        {order.delivery_date && <div style={{ fontSize: 14, color: "var(--soft)" }}>Your treats arrive {order.delivery_date}</div>}
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
          No charge was made. Your cart and delivery date are saved — give it another go.
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

        {order.status === "PAID" && (
          <>
            <div style={{ padding: 14, borderRadius: 16, background: order.fulfillment_stage === "out_for_delivery" ? "var(--tint-info)" : "var(--tint-amber)", border: `1.5px solid ${order.fulfillment_stage === "out_for_delivery" ? "rgba(59,159,214,0.35)" : "rgba(245,140,33,0.3)"}` }}>
              {order.fulfillment_stage === "out_for_delivery" ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--blue)" }}>🛵 On its way — arriving today</div>
                  <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>{order.courier?.name} · courier picked up your order</div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--choco)" }}>🧑‍🍳 Your treats are being baked fresh</div>
                  {order.delivery_date && <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>Arrives {order.delivery_date}</div>}
                </>
              )}
            </div>
            <OrderTimeline stage={order.fulfillment_stage ?? "baking"} />
            {order.fulfillment_stage === "out_for_delivery" && (
              <button className="btn-outline" style={{ width: "100%", borderColor: "var(--blue)", color: "var(--blue)" }}>Track with courier →</button>
            )}
            <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12 }}><ItemsSummary order={order} /></div>
            <SupportLink />
          </>
        )}

        {order.status === "FULFILLED" && (
          <>
            <div style={{ padding: 14, borderRadius: 16, background: "var(--tint-success)", border: "1.5px solid rgba(45,147,34,0.3)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--green)" }}>✓ Delivered — enjoy every bite! 🍪</div>
            </div>
            <OrderTimeline stage="delivered" />
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
