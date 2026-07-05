"use client";

/** Footer (ported): brand, order/contact + explore columns, staff sign-in. */
import Link from "next/link";
import { useLanding } from "@/lib/landing/LandingContext";
import { useCart } from "@/lib/cart/CartContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";

const SHOPEE = "https://id.shp.ee/LmuoUgTN?share_channel_code=1";
const GRAB = "https://food.grab.com/id/id/restaurant/no-bites-left-kebagusan-delivery/6-C74HGJNAT66UGT";
const IG = "https://instagram.com/nobitesleft.id";

export default function LandingFooter() {
  const { t } = useLanding();
  const { itemCount } = useCart();
  const flow = useOrderFlow();
  const orderDirect = () => {
    if (itemCount > 0) flow.open("cart");
    else document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  };
  const linkStyle: React.CSSProperties = { opacity: 0.92, color: "inherit" };

  return (
    <footer data-r="footer" style={{ background: "#150d06", color: "#fdefd9", padding: "64px 44px 40px" }}>
      <div data-r="footer-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 40, alignItems: "start" }}>
        <div>
          <img src="/images/logo-cookies.png" alt="No Bites Left" style={{ height: 40 }} />
          <p className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "var(--orange)", margin: "16px 0 0" }}>{t.footerTag}</p>
          <p style={{ fontSize: 14, color: "rgba(253,239,217,0.66)", margin: "8px 0 0", maxWidth: 320, lineHeight: 1.5 }}>{t.footerDesc}</p>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(253,239,217,0.55)", marginBottom: 14 }}>{t.footerOrderC}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 15, fontWeight: 700 }}>
            <button onClick={orderDirect} style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", font: "inherit", ...linkStyle }}>{t.orderNow}</button>
            <a href={SHOPEE} target="_blank" rel="noreferrer" style={linkStyle}>Shopee Food</a>
            <a href={GRAB} target="_blank" rel="noreferrer" style={linkStyle}>GrabFood</a>
            <a href={IG} target="_blank" rel="noreferrer" style={linkStyle}>Instagram · @nobitesleft.id</a>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(253,239,217,0.55)", marginBottom: 14 }}>{t.footerExplore}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 15, fontWeight: 700 }}>
            <a href="#menu" style={linkStyle}>{t.navMenu}</a>
            <a href="#inside" style={linkStyle}>{t.navInside}</a>
            <a href="#cafes" style={linkStyle}>{t.footerWholesale}</a>
            <a href="#feedback" style={linkStyle}>{t.navFeedback}</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "44px auto 0", paddingTop: 22, borderTop: "1.5px solid rgba(253,239,217,0.16)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 13, fontWeight: 600, color: "rgba(253,239,217,0.55)" }}>
        <span>{t.rights}</span>
        <Link href="/admin/login" style={{ opacity: 0.5, color: "inherit" }}>{t.authStaff}</Link>
        <span>{t.bakedJkt}</span>
      </div>
    </footer>
  );
}
