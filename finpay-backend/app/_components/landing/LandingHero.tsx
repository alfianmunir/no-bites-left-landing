"use client";

/**
 * Hero (ported from the prototype): a cycling product showcase with floating
 * serving-size + calorie badges, headline, chips, CTAs and stats. The primary
 * CTA opens the order drawer; the secondary scrolls to the menu.
 */
import { useEffect, useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";

interface HeroProduct { name: string; img: string; serv: string; cal: string; accent: string }

const HERO: HeroProduct[] = [
  { name: "OG Cookies", img: "/images/hero-og-c.png", serv: "40", cal: "~190", accent: "#f58c21" },
  { name: "Choco Cookies", img: "/images/hero-choco-c.png", serv: "40", cal: "~190", accent: "#54300b" },
  { name: "Hazel Cookies", img: "/images/hero-hazel-c.png", serv: "40", cal: "~190", accent: "#7a4a18" },
  { name: "Matcha Cookies", img: "/images/hero-matcha-c.png", serv: "40", cal: "~190", accent: "#2d9322" },
  { name: "Apple Pie", img: "/images/hero-apple-c.png", serv: "120", cal: "~320", accent: "#e24026" },
];

export default function LandingHero() {
  const { t } = useLanding();
  const flow = useOrderFlow();
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % HERO.length), 2600);
    return () => clearInterval(id);
  }, []);
  const h = HERO[i];

  return (
    <>
      <header id="top" data-r="hero" style={{ position: "relative", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "center", maxWidth: 1240, margin: "0 auto", padding: "80px 44px 96px", scrollMarginTop: 80 }}>
        <div data-r="hero-copy" style={{ position: "relative", zIndex: 2 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--soft)", fontWeight: 800, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 15px", borderRadius: 999 }}>{t.heroBadge}</div>
          <h1 data-r="h1" className="font-display" style={{ fontWeight: 700, fontSize: 74, lineHeight: 1.0, letterSpacing: "-0.01em", margin: "24px 0 0", color: "var(--ink)", animation: "heroIn .7s ease both" }}>
            {t.heroT1}<br />{t.heroT2pre}<span style={{ color: "var(--orange)" }}>{t.heroT2accent}</span>
          </h1>
          <p style={{ maxWidth: 460, fontSize: 18, lineHeight: 1.6, color: "var(--soft)", fontWeight: 400, margin: "24px 0 0" }}>
            {t.heroDesc}<strong style={{ color: "var(--ink)", fontWeight: 700 }}>No Bites Left</strong>{t.heroDescEnd}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            {[["var(--orange)", t.chip1], ["var(--green)", t.chip2], ["var(--red)", t.chip3]].map(([c, txt]) => (
              <span key={txt} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: 800, color: "var(--soft)" }}><span style={{ color: c }}>●</span> {txt}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 30, flexWrap: "wrap" }}>
            <button onClick={() => flow.open("cart")} style={{ display: "inline-flex", alignItems: "center", color: "var(--bg)", fontWeight: 800, fontSize: 16, padding: "16px 30px", borderRadius: 999, boxShadow: "0 4px 0 rgba(0,0,0,0.16)", background: "#e24126", border: "none", cursor: "pointer" }}>{t.ctaBox}</button>
            <a href="#menu" style={{ display: "inline-flex", alignItems: "center", color: "#e24126", fontWeight: 800, fontSize: 16, padding: "16px 26px", borderRadius: 999, border: "2px solid #e24126", background: "transparent" }}>{t.ctaMenu}</a>
          </div>
          <div style={{ display: "flex", gap: 34, marginTop: 42 }}>
            {[[t.stat1n, t.stat1l], [t.stat2n, t.stat2l], [t.stat3n, t.stat3l]].map(([n, l], idx) => (
              <span key={l} style={{ display: "flex", gap: 34 }}>
                {idx > 0 && <span style={{ width: 1.5, background: "var(--line)" }} />}
                <span>
                  <span className="font-display" style={{ display: "block", fontWeight: 700, fontSize: 28, color: "var(--ink)" }}>{n}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--soft)" }}>{l}</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div data-r="hero-imgbox" style={{ position: "relative", width: 400, height: 440, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img key={h.img} src={h.img} alt={h.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", animation: "popfade .4s ease" }} />
            <div style={{ position: "absolute", top: -8, right: -12, zIndex: 3, animation: "bobx 4.4s ease-in-out infinite", background: "var(--red)", color: "#fff", borderRadius: 18, padding: "14px 18px", textAlign: "center", boxShadow: "0 14px 28px rgba(0,0,0,0.22)" }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{t.servLabel}</div>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.05 }}>{h.serv}<span style={{ fontSize: 13 }}> {t.servUnit}</span></div>
            </div>
            <div style={{ position: "absolute", bottom: 24, left: -12, zIndex: 3, animation: "bob2 5s ease-in-out infinite", background: "var(--green)", color: "#fff", borderRadius: 18, padding: "14px 18px", textAlign: "center", boxShadow: "0 14px 28px rgba(0,0,0,0.22)" }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{t.calLabel}</div>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.05 }}>{h.cal}<span style={{ fontSize: 13 }}> {t.calUnit}</span></div>
            </div>
          </div>
        </div>
      </header>

      <div data-r="marquee" style={{ background: "var(--choco)", color: "#fdefd9", overflow: "hidden", whiteSpace: "nowrap", padding: "13px 0" }}>
        <div className="font-display" style={{ display: "inline-flex", animation: "marquee 40s linear infinite", willChange: "transform", fontWeight: 400, fontSize: 16, letterSpacing: "0.03em" }}>
          {[0, 1].map((k) => (
            <span key={k} aria-hidden={k === 1} style={{ opacity: 0.94 }}>OG&nbsp;&nbsp;✦&nbsp;&nbsp;CHOCO&nbsp;&nbsp;✦&nbsp;&nbsp;HAZEL&nbsp;&nbsp;✦&nbsp;&nbsp;MATCHA&nbsp;&nbsp;✦&nbsp;&nbsp;FUDGY BROWNIES BITES&nbsp;&nbsp;✦&nbsp;&nbsp;APPLE PIE&nbsp;&nbsp;✦&nbsp;&nbsp;</span>
          ))}
        </div>
      </div>
    </>
  );
}
