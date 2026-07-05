"use client";

/** "What's Inside" — a scrolling strip of ingredient badges (ported). */
import { useLanding } from "@/lib/landing/LandingContext";

const BASE = [
  { img: "/images/ing-og.png", label: "OG" },
  { img: "/images/ing-choco.png", label: "Choco" },
  { img: "/images/ing-hazel.png", label: "Hazel" },
  { img: "/images/ing-matcha.png", label: "Matcha" },
  { brownie: true, label: "Brownies" },
  { img: "/images/ing-apple.png", label: "Apple Pie" },
];

export default function LandingInside() {
  const { t } = useLanding();
  const badges = [...BASE, ...BASE];
  return (
    <section id="inside" style={{ background: "var(--surface2)", padding: "96px 0", scrollMarginTop: 72, overflow: "hidden" }}>
      <div data-rpad="" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 44px" }}>
        <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 50px" }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.insideKicker}</div>
          <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 48, lineHeight: 1.05, margin: "14px 0 0", color: "var(--ink)" }}>{t.insideTitle}</h2>
          <p style={{ fontSize: 18, color: "var(--soft)", margin: "16px 0 0" }}>{t.insideSub}</p>
        </div>
      </div>
      <div style={{ overflow: "hidden", width: "100%" }}>
        <div style={{ display: "flex", gap: 30, width: "max-content", alignItems: "start", padding: "0 15px", animation: "badgescroll 34s linear infinite" }}>
          {badges.map((b, i) => (
            <div key={i} style={{ width: 190, flex: "none", textAlign: "center" }}>
              {"brownie" in b && b.brownie ? (
                <div style={{ aspectRatio: "1", borderRadius: "50%", background: "#fdefd9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
                  <img src="/images/mini-brownies.png" alt="" style={{ height: 30 }} />
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: "#54300b", marginTop: 6 }}>{t.ingTitle}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#241504", lineHeight: 1.35, marginTop: 6 }} dangerouslySetInnerHTML={{ __html: t.ingList }} />
                </div>
              ) : (
                <img src={(b as { img: string }).img} alt="ingredients" style={{ width: "100%", height: "auto", display: "block", margin: "0 auto" }} />
              )}
              <div className="font-display" style={{ fontWeight: 700, fontSize: 16, marginTop: 8, color: "var(--ink)" }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
