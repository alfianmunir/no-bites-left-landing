"use client";

/** "How to treat" — store / chill / revive cards (ported). */
import { useLanding } from "@/lib/landing/LandingContext";

export default function LandingTreat() {
  const { t } = useLanding();
  const cards = [
    { color: "var(--orange)", tint: "rgba(245,140,33,0.12)", k: t.storeK, title: t.storeT, sub: t.storeS, icon: (<><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" /><line x1="12" y1="1.8" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22.2" /><line x1="1.8" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22.2" y2="12" /><line x1="4.6" y1="4.6" x2="6.2" y2="6.2" /><line x1="17.8" y1="17.8" x2="19.4" y2="19.4" /><line x1="4.6" y1="19.4" x2="6.2" y2="17.8" /><line x1="17.8" y1="6.2" x2="19.4" y2="4.6" /></>) },
    { color: "var(--blue)", tint: "rgba(59,159,214,0.12)", k: t.chillK, title: t.chillT, sub: t.chillS, icon: (<><line x1="12" y1="2.5" x2="12" y2="21.5" /><line x1="3.8" y1="7.2" x2="20.2" y2="16.8" /><line x1="20.2" y1="7.2" x2="3.8" y2="16.8" /></>) },
    { color: "var(--red)", tint: "rgba(226,64,38,0.12)", k: t.reviveK, title: t.reviveT, sub: t.reviveS, icon: (<><rect x="3" y="4.5" width="18" height="15" rx="3" /><line x1="3" y1="9.2" x2="21" y2="9.2" /><path d="M9 13.5c1-1.2 2-1.2 3 0s2 1.2 3 0" strokeWidth="1.7" /></>) },
  ];
  return (
    <section data-r="treat-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 44px", scrollMarginTop: 72 }}>
      <div data-r="treat" style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 56, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.treatKicker}</div>
          <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 44, lineHeight: 1.08, margin: "14px 0 0", color: "var(--ink)" }}>{t.treatTitle}</h2>
          <p style={{ fontSize: 18, lineHeight: 1.65, color: "var(--soft)", margin: "18px 0 0" }}>{t.treatDesc}</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 24, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 14, padding: "12px 18px", fontWeight: 800, fontSize: 14, color: "var(--soft)" }}><span style={{ color: "var(--red)" }}>●</span> {t.treatNote}</div>
        </div>
        <div data-r="treat-cards" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {cards.map((c) => (
            <div key={c.k} style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 20, padding: 24, borderTop: `5px solid ${c.color}` }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", color: c.color }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{c.icon}</svg>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.color, marginTop: 16 }}>{c.k}</div>
              <h3 className="font-display" style={{ fontWeight: 700, fontSize: 22, margin: "8px 0 0", color: "var(--ink)" }}>{c.title}</h3>
              <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--soft)", margin: "7px 0 0" }}>{c.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
