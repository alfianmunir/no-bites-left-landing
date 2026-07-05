"use client";

/**
 * The single slide-over order drawer (README): cart → sign-in gate → pickup
 * date → review → (Finpay redirect), plus My Orders, Profile, and in-drawer
 * order status/tracking. v1 = PICKUP only.
 */
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { useOrderFlow, type OrderScreen } from "@/lib/order-flow/OrderFlowContext";
import { PICKUP_LOCATION, SUPPORT_WHATSAPP } from "@/lib/fulfillment";
import { formatPickupDate } from "@/lib/pickupDate";
import type { Order, OrderStatus } from "@/lib/orders";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const THUMB: Record<string, string> = {
  og: "/images/menu-og-c.png",
  hazel: "/images/menu-hazel-c.png",
  choco: "/images/menu-choco-c.png",
  matcha: "/images/menu-matcha-c.png",
};
function thumb(sku: string): string {
  return THUMB[sku.split("-")[0]] ?? "/images/mini-cookies.png";
}

function Head({ title, onBack, backIcon = "‹" }: { title: string; onBack: () => void; backIcon?: string }) {
  return (
    <div className="nbl-screen-head">
      <button className="nbl-iconbtn" onClick={onBack} aria-label="back">{backIcon}</button>
      <div className="font-display" style={{ fontSize: 18 }}>{title}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Cart
function CartScreen() {
  const { items, itemCount, subtotal, setQty, removeItem } = useCart();
  const flow = useOrderFlow();

  if (items.length === 0) {
    return (
      <div className="nbl-screen">
        <Head title="Your Cart" onBack={flow.close} backIcon="✕" />
        <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
          <img src="/images/mini-cookies.png" alt="" width={72} height={72} style={{ objectFit: "contain", opacity: 0.9 }} />
          <div className="font-display" style={{ fontSize: 22 }}>Your cart&apos;s a little empty</div>
          <div style={{ fontSize: 13.5, color: "var(--soft)" }}>Add a treat or two and they&apos;ll show up here.</div>
          <button className="btn-primary" style={{ maxWidth: 220, marginTop: 6 }} onClick={flow.close}>Browse treats</button>
        </div>
      </div>
    );
  }

  return (
    <div className="nbl-screen">
      <Head title={`Your Cart (${itemCount})`} onBack={flow.close} backIcon="✕" />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((l) => (
          <div key={l.sku} style={{ display: "flex", gap: 13, padding: 12, border: "1.5px solid var(--line)", borderRadius: 16, background: "var(--surface)", alignItems: "center" }}>
            <img src={thumb(l.sku)} alt="" width={58} height={58} style={{ borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{l.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--soft)" }}>{l.variant}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 8, border: "1.5px solid var(--line)", borderRadius: 99, width: "fit-content", overflow: "hidden" }}>
                <button
                  onClick={() => (l.qty === 1 ? removeItem(l.sku) : setQty(l.sku, l.qty - 1))}
                  style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", color: l.qty === 1 ? "var(--red)" : "var(--ink)", fontSize: 14 }}
                  aria-label={l.qty === 1 ? "remove" : "decrease"}
                >
                  {l.qty === 1 ? "🗑" : "−"}
                </button>
                <span style={{ minWidth: 24, textAlign: "center", fontWeight: 800, fontSize: 14 }}>{l.qty}</span>
                <button onClick={() => setQty(l.sku, l.qty + 1)} style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }} aria-label="increase">+</button>
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{rupiah(l.unitPrice * l.qty)}</div>
          </div>
        ))}
      </div>
      <div className="nbl-screen-foot">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
          <span style={{ color: "var(--soft)" }}>Subtotal</span>
          <span style={{ fontWeight: 900 }}>{rupiah(subtotal)}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--soft)", marginBottom: 12 }}>Pickup date comes next · pay online</div>
        <button className="btn-primary" onClick={flow.startCheckout}>Checkout · {rupiah(subtotal)}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sign-in
function SignInScreen() {
  const { itemCount, subtotal } = useCart();
  const { signInWithGoogle } = useAuth();
  const flow = useOrderFlow();
  return (
    <div className="nbl-screen">
      <Head title="" onBack={() => flow.go("cart")} />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
        <img src="/images/mini-cookies.png" alt="" width={64} height={64} style={{ objectFit: "contain" }} />
        <div className="font-display" style={{ fontSize: 22 }}>Sign in to check out</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 280 }}>Your cart&apos;s safe with us 🍪 — you won&apos;t lose a crumb.</div>
        <div className="pill" style={{ background: "var(--surface2)", border: "1.5px solid var(--line)", color: "var(--ink)" }}>
          🛒 Cart saved · {itemCount} items · {rupiah(subtotal)}
        </div>
        <button
          onClick={() => signInWithGoogle("/")}
          style={{ width: "100%", maxWidth: 320, marginTop: 8, padding: 14, borderRadius: 14, background: "#fff", border: "1.5px solid var(--line)", fontWeight: 800, fontSize: 14.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: "conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0)", display: "inline-block" }} />
          Continue with Google
        </button>
        <div style={{ fontSize: 11, color: "var(--soft)", maxWidth: 260, marginTop: 4 }}>By continuing you agree to our terms. We only use your email to send order updates.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pickup date
function PickupLocationCard() {
  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 16, padding: 14, display: "flex", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: "#fff3e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🛍️</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em" }}>PICK UP AT</div>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{PICKUP_LOCATION.name}</div>
        <div style={{ fontSize: 13, color: "var(--soft)" }}>{PICKUP_LOCATION.address}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--choco)", marginTop: 2 }}>{PICKUP_LOCATION.hours}</div>
      </div>
    </div>
  );
}

function DateScreen() {
  const flow = useOrderFlow();
  const selected = flow.pickupDate;
  return (
    <div className="nbl-screen">
      <Head title="Choose your pickup date" onBack={() => flow.go("cart")} />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "var(--surface2)", border: "1.5px solid var(--line)", borderRadius: 14, padding: 12, fontSize: 12.5, color: "var(--soft)" }}>
          🧑‍🍳 Every box is baked fresh to order — the earliest pickup is 3 days out.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {flow.pickupWindow.map((d) => {
            const isSel = d.date === selected;
            return (
              <button
                key={d.date}
                disabled={d.disabled}
                onClick={() => flow.setPickupDate(d.date)}
                style={{
                  borderRadius: 12,
                  padding: "10px 0",
                  border: isSel ? "1.5px solid var(--orange)" : "1.5px solid var(--line)",
                  background: isSel ? "var(--orange)" : d.disabled ? "var(--surface2)" : "var(--surface)",
                  color: isSel ? "#fff" : "var(--ink)",
                  opacity: d.tooSoon ? 0.45 : d.full ? 0.6 : 1,
                  cursor: d.disabled ? "default" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800 }}>{d.weekday}</span>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{d.day}</span>
                {d.full && <span style={{ fontSize: 8.5, fontWeight: 900, color: "var(--red)" }}>FULL</span>}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: "var(--soft)" }}>
          {selected ? <>Selected: <b style={{ color: "var(--ink)" }}>{formatPickupDate(selected)}</b> · </> : null}
          earliest is 3 days out · max 30 pcs/item per day
        </div>
        <PickupLocationCard />
        <div style={{ border: "1.5px dashed var(--line)", background: "var(--surface2)", borderRadius: 99, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--soft)" }}>
          🛵 <span><b>Delivery</b> — we&apos;re baking this up next. Pickup only for now.</span>
          <span className="pill" style={{ marginLeft: "auto", background: "var(--surface)", border: "1.5px solid var(--line)", fontSize: 10 }}>SOON</span>
        </div>
      </div>
      <div className="nbl-screen-foot">
        <button className="btn-primary" disabled={!selected} onClick={() => flow.go("review")}>Continue</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Review
function ReviewScreen() {
  const { items, subtotal } = useCart();
  const flow = useOrderFlow();
  const total = subtotal; // items only — no delivery fee (v1)
  return (
    <div className="nbl-screen" style={{ background: "var(--surface)" }}>
      <Head title="Review order" onBack={() => flow.go("date")} />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 8 }}>ITEMS ({items.reduce((s, l) => s + l.qty, 0)})</div>
          {items.map((l) => (
            <div key={l.sku} style={{ fontSize: 13.5, display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{l.qty}× {l.name} · {l.variant}</span>
              <span>{rupiah(l.unitPrice * l.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 6 }}>PICKUP</div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{flow.pickupDate ? formatPickupDate(flow.pickupDate) : "—"}</div>
          <div style={{ fontSize: 13, color: "var(--soft)" }}>{PICKUP_LOCATION.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--soft)" }}>{PICKUP_LOCATION.address}</div>
          <div style={{ fontSize: 12.5, color: "var(--choco)", fontWeight: 700 }}>{PICKUP_LOCATION.hours}</div>
        </div>
        <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12 }}>
          <label className="field-label">Mobile number for pickup updates</label>
          <input
            className="field-input"
            type="tel"
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={flow.phone}
            onChange={(e) => flow.setPhone(e.target.value)}
          />
        </div>
        {flow.payError && (
          <div style={{ padding: 12, borderRadius: 12, background: "var(--tint-error)", color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{flow.payError}</div>
        )}
        <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--soft)" }}>
            <span>Subtotal</span><span>{rupiah(subtotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
            <span style={{ color: "var(--soft)" }}>Pickup</span><span style={{ color: "var(--green)", fontWeight: 800 }}>Free</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 900, marginTop: 4 }}>
            <span>Total</span><span>{rupiah(total)}</span>
          </div>
        </div>
      </div>
      <div className="nbl-screen-foot" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <button className="btn-calm" disabled={flow.paying} onClick={flow.payNow}>
          {flow.paying ? "Taking you to Finpay…" : `Pay now · ${rupiah(total)}`}
        </button>
        <div style={{ fontSize: 11.5, color: "var(--soft)" }}>🔒 Secured by Finpay</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- My Orders
const STATUS_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: "var(--tint-amber)", color: "var(--choco)", label: "Waiting payment" },
  PAID: { bg: "#fff3e2", color: "var(--choco)", label: "Paid" },
  BAKING: { bg: "#fff3e2", color: "var(--choco)", label: "Baking" },
  READY_FOR_PICKUP: { bg: "var(--tint-amber)", color: "var(--choco)", label: "Ready for pickup" },
  PICKED_UP: { bg: "#e9f5e7", color: "var(--green)", label: "Picked up" },
  EXPIRED: { bg: "var(--surface2)", color: "var(--soft)", label: "Expired" },
  CANCELLED: { bg: "var(--surface2)", color: "var(--soft)", label: "Cancelled" },
  REFUNDED: { bg: "#e8f6ff", color: "var(--blue)", label: "Refunded" },
};

function OrdersScreen() {
  const flow = useOrderFlow();
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => {
    fetch("/api/orders/mine")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => setOrders([]));
  }, []);
  return (
    <div className="nbl-screen">
      <Head title="My Orders" onBack={flow.close} />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orders === null ? (
          <div style={{ textAlign: "center", color: "var(--soft)", fontSize: 13.5, padding: 30 }}>Loading…</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--soft)", fontSize: 13.5, padding: 30 }}>No orders yet — your first batch is a few taps away.</div>
        ) : (
          orders.map((o) => {
            const chip = STATUS_CHIP[o.status] ?? STATUS_CHIP.PENDING;
            return (
              <button key={o.id} onClick={() => flow.openStatus(o.id)} style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 16, padding: 12, cursor: "pointer" }}>
                <img src={thumb(o.items[0]?.sku ?? "og-40")} alt="" width={48} height={48} style={{ borderRadius: 12, objectFit: "cover" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>#{o.id} · {o.items.reduce((s, i) => s + i.qty, 0)} items</div>
                  <div style={{ fontSize: 12, color: "var(--soft)" }}>{o.pickup_date ? `Pickup ${o.pickup_date}` : rupiah(o.amount)}</div>
                </div>
                <span className="pill" style={{ background: chip.bg, color: chip.color }}>{chip.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Profile
function ProfileScreen() {
  const { user, signOut } = useAuth();
  const flow = useOrderFlow();
  const initial = (user?.name?.[0] ?? "?").toUpperCase();
  return (
    <div className="nbl-screen">
      <Head title="Profile" onBack={flow.close} />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--choco)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900 }}>{initial}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name ?? "Guest"}</div>
            <div style={{ fontSize: 13, color: "var(--soft)" }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => flow.go("orders")} style={{ textAlign: "left", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🧾 My Orders</button>
          <div style={{ background: "var(--surface2)", border: "1.5px solid var(--line)", borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 14, color: "var(--soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📍 Address book</span>
            <span className="pill" style={{ background: "var(--surface)", border: "1.5px solid var(--line)", fontSize: 10 }}>SOON</span>
          </div>
        </div>
        <button className="btn-outline" style={{ borderColor: "rgba(226,64,38,0.4)", color: "var(--red)", marginTop: 6 }} onClick={async () => { await signOut(); flow.close(); }}>Sign out</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Status
const TIMELINE: { key: OrderStatus; label: string }[] = [
  { key: "PAID", label: "Paid" },
  { key: "BAKING", label: "Baking — in progress" },
  { key: "READY_FOR_PICKUP", label: "Ready for pickup 🛍️" },
  { key: "PICKED_UP", label: "Picked up" },
];

function StatusScreen() {
  const flow = useOrderFlow();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  useEffect(() => {
    if (!flow.statusOrderId) return;
    fetch(`/api/orders/${flow.statusOrderId}`)
      .then((r) => (r.ok ? r.json() : { order: null }))
      .then((d) => setOrder(d.order))
      .catch(() => setOrder(null));
  }, [flow.statusOrderId]);

  const dateLabel = order?.pickup_date ? formatPickupDate(order.pickup_date) : null;
  const currentIndex = order ? TIMELINE.findIndex((t) => t.key === order.status) : -1;

  return (
    <div className="nbl-screen">
      <Head title={order ? `Order #${order.id}` : "Order"} onBack={() => flow.go("orders")} />
      <div className="nbl-screen-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {order === undefined ? (
          <div style={{ textAlign: "center", color: "var(--soft)", padding: 30 }}>Loading…</div>
        ) : order === null ? (
          <div style={{ textAlign: "center", color: "var(--soft)", padding: 30 }}>Order not found.</div>
        ) : (
          <>
            <div style={{ padding: 14, borderRadius: 16, background: order.status === "READY_FOR_PICKUP" ? "var(--tint-success)" : "var(--tint-amber)", border: "1.5px solid rgba(245,140,33,0.3)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: order.status === "READY_FOR_PICKUP" ? "var(--green)" : "var(--choco)" }}>
                {order.status === "READY_FOR_PICKUP" ? "🛍️ Ready to collect" : "🧑‍🍳 Collect your box"}{dateLabel ? ` on ${dateLabel}` : ""}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>Baked fresh to order · {PICKUP_LOCATION.name}</div>
            </div>
            {currentIndex >= 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {TIMELINE.map((node, i) => {
                  const state = i < currentIndex || order.status === "PICKED_UP" ? "done" : i === currentIndex ? "active" : "upcoming";
                  const isLast = i === TIMELINE.length - 1;
                  return (
                    <div key={node.key} style={{ display: "flex", gap: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", background: state === "upcoming" ? "var(--surface2)" : state === "active" ? "var(--orange)" : "var(--green)", border: state === "upcoming" ? "1.5px solid var(--line)" : "none", color: state === "upcoming" ? undefined : "#fff", animation: state === "active" ? "pulseGlow 1.6s ease-in-out infinite" : undefined }}>
                          {state === "done" ? "✓" : ""}
                        </div>
                        {!isLast && <div style={{ width: 2, flex: 1, background: state === "upcoming" ? "var(--line)" : "var(--green)" }} />}
                      </div>
                      <div style={{ paddingBottom: isLast ? 0 : 18, fontSize: 13.5, fontWeight: state === "active" ? 800 : state === "done" ? 700 : 400, color: state === "upcoming" ? "var(--soft)" : state === "active" ? "var(--orange)" : undefined }}>{node.label}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <PickupLocationCard />
            <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12, fontSize: 13, color: "var(--soft)" }}>
              {order.items.reduce((s, i) => s + i.qty, 0)} items · {rupiah(order.amount)} · pickup at {PICKUP_LOCATION.name}
            </div>
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Hi! I have a question about order ${order.id}`)}`} target="_blank" rel="noreferrer" className="btn-outline" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
              Problem with your order? WhatsApp us
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Shell
const SCREENS: Record<OrderScreen, () => React.JSX.Element> = {
  cart: CartScreen,
  signin: SignInScreen,
  date: DateScreen,
  review: ReviewScreen,
  orders: OrdersScreen,
  profile: ProfileScreen,
  status: StatusScreen,
};

export default function OrderDrawer() {
  const flow = useOrderFlow();
  if (!flow.screen) return null;
  const Screen = SCREENS[flow.screen];
  return (
    <div className="nbl-scrim" onClick={flow.close}>
      <div className="nbl-panel" onClick={(e) => e.stopPropagation()}>
        <Screen />
      </div>
    </div>
  );
}
