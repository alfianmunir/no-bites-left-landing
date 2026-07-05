"use client";

/** Founder story + product evolution timeline (ported from the prototype). */
import { useLanding } from "@/lib/landing/LandingContext";

export default function LandingStory() {
  const { t } = useLanding();
  const pStyle: React.CSSProperties = { fontSize: 17, lineHeight: 1.7, color: "var(--soft)", margin: "18px 0 0" };
  return (
    <section id="story" data-r="story" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 60, alignItems: "center", maxWidth: 1200, margin: "0 auto", padding: "104px 44px", scrollMarginTop: 72 }}>
      <div style={{ position: "relative" }}>
        <div style={{ aspectRatio: "4/5", borderRadius: 28, border: "1.5px solid var(--line)", background: "var(--surface2)", overflow: "hidden" }}>
          <img src="/images/founder-alfian.jpg" alt="Alfian, founder" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ position: "absolute", bottom: -18, right: -14, maxWidth: 230, background: "var(--red)", color: "#fff", padding: "16px 18px", borderRadius: 18, transform: "rotate(-4deg)", boxShadow: "0 8px 20px rgba(0,0,0,0.2)" }}>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 19, lineHeight: 1.1 }}>Alfian</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.92, marginTop: 3 }}>{t.storyCard}</div>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.storyKicker}</div>
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 48, lineHeight: 1.05, margin: "14px 0 0", color: "var(--ink)" }}>{t.storyTitle}</h2>
        <p style={pStyle} dangerouslySetInnerHTML={{ __html: t.storyP1 }} />
        <p style={pStyle} dangerouslySetInnerHTML={{ __html: t.storyP2 }} />

        <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 34, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140, padding: "16px 18px", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: "18px 0 0 18px", borderRight: "none" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--red)" }}>{t.tl1k}</div>
            <div className="font-display" style={{ fontWeight: 700, fontSize: 19, color: "var(--ink)", marginTop: 6 }}>Apple Pie</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soft)", marginTop: 2 }}>{t.tl1s}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, padding: "16px 18px", background: "var(--surface)", border: "1.5px solid var(--line)", borderRight: "none" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--orange)" }}>{t.tl2k}</div>
            <div className="font-display" style={{ fontWeight: 700, fontSize: 19, color: "var(--ink)", marginTop: 6 }}>Cookies</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soft)", marginTop: 2 }}>OG · Choco · Hazel · Matcha</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, padding: "16px 18px", background: "var(--surface)", border: "1.5px solid var(--line)", borderRight: "none" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--choco)" }}>{t.tl3k}</div>
            <div className="font-display" style={{ fontWeight: 700, fontSize: 19, color: "var(--ink)", marginTop: 6 }}>Brownies</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soft)", marginTop: 2 }}>{t.tl3s}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, padding: "16px 18px", background: "var(--ink)", color: "var(--bg)", border: "1.5px solid var(--ink)", borderRadius: "0 18px 18px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--orange)" }}>{t.tl4k}</div>
            <div className="font-display" style={{ fontWeight: 700, fontSize: 19, marginTop: 6 }}>{t.tl4t}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.7, marginTop: 2 }}>{t.tl4s}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
