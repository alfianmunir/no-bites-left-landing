"use client";

/**
 * Order section (#order): primary "Order direct" opens the pickup drawer (cart
 * if there are items, else scrolls to the menu); marketplace links (Shopee /
 * GrabFood) remain as alternatives.
 */
import { useLanding } from "@/lib/landing/LandingContext";
import { useCart } from "@/lib/cart/CartContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";

const SHOPEE = "https://id.shp.ee/LmuoUgTN?share_channel_code=1";
const GRAB = "https://food.grab.com/id/id/restaurant/no-bites-left-kebagusan-delivery/6-C74HGJNAT66UGT";

export default function LandingOrder() {
  const { t } = useLanding();
  const { itemCount } = useCart();
  const flow = useOrderFlow();

  const orderDirect = () => {
    if (itemCount > 0) flow.open("cart");
    else document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  };

  const mkt = (bg: string, name: string, href: string) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: bg, color: "#fff", borderRadius: 22, padding: "28px 30px", boxShadow: "0 8px 0 rgba(0,0,0,0.22)" }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>{t.orderOn}</div><div className="font-display" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.1 }}>{name}</div></div>
      <span style={{ fontSize: 30, fontWeight: 800 }}>→</span>
    </a>
  );

  return (
    <section id="order" data-r="order-sec" style={{ background: "var(--dark)", color: "var(--on-dark)", padding: "100px 44px", scrollMarginTop: 72 }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.orderKicker}</div>
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 52, lineHeight: 1.04, margin: "14px 0 0" }}>{t.orderTitle}</h2>
        <p style={{ fontSize: 18, color: "rgba(244,235,221,0.75)", margin: "16px auto 0", maxWidth: 560 }}>{t.orderSub}</p>

        <button onClick={orderDirect} data-r="order-direct" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", borderRadius: 22, padding: "30px 32px", marginTop: 42, textAlign: "left", boxShadow: "0 8px 0 rgba(0,0,0,0.22)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src="/images/mini-cookies.png" style={{ height: 52 }} alt="" />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.1 }}>{t.orderNow}</div>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", background: "#fff", color: "var(--orange)", borderRadius: 999, padding: "4px 10px" }}>New</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.92, marginTop: 3 }}>{t.orderSub}</div>
            </div>
          </div>
          <span style={{ fontSize: 30, fontWeight: 800 }}>→</span>
        </button>

        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", color: "rgba(244,235,221,0.55)", marginTop: 26 }}>or order through a marketplace</div>
        <div data-r="order-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 16, textAlign: "left" }}>
          {mkt("#ee4d2d", "Shopee", SHOPEE)}
          {mkt("#00b14f", "GrabFood", GRAB)}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(244,235,221,0.5)", margin: "22px 0 0" }} dangerouslySetInnerHTML={{ __html: t.orderDM }} />
      </div>
    </section>
  );
}
