"use client";

/** First-visit "Pick your vibe" overlay (ported). Sets the background theme. */
import { useLanding } from "@/lib/landing/LandingContext";
import { THEME_ORDER, THEME_SWATCHES } from "@/lib/landing/themes";

export default function LandingThemePicker() {
  const { t, showPicker, setTheme, dismissPicker } = useLanding();
  if (!showPicker) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#efe9dd", display: "flex", alignItems: "center", justifyContent: "center", padding: 28, overflow: "auto", animation: "drawerIn .35s ease" }}>
      <div style={{ maxWidth: 680, width: "100%", textAlign: "center" }}>
        <img src="/images/mini-cookies.png" alt="" style={{ height: 44, animation: "bobx 4.4s ease-in-out infinite" }} />
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 42, lineHeight: 1.06, margin: "18px 0 0", color: "#281a0b" }}>{t.pickerTitle}</h2>
        <p style={{ fontSize: 16, color: "#6f5c45", margin: "10px 0 0", fontWeight: 500 }}>{t.pickerSub}</p>
        <div data-r="theme-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 32 }}>
          {THEME_ORDER.map((name) => {
            const sw = THEME_SWATCHES[name];
            const meta = t.th[name];
            return (
              <button key={name} data-r="theme-card" onClick={() => { setTheme(name); dismissPicker(); }} style={{ display: "flex", flexDirection: "column", padding: 0, background: "#fff", border: "1.5px solid rgba(40,26,11,0.10)", borderRadius: 18, overflow: "hidden", textAlign: "left", cursor: "pointer" }}>
                <div data-r="theme-prev" style={{ height: 84, background: sw.sw1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, borderBottom: "1.5px solid rgba(40,26,11,0.07)" }}>
                  <div style={{ width: 30, height: 42, borderRadius: 8, background: sw.sw2, boxShadow: "0 3px 8px rgba(0,0,0,0.13)" }} />
                  <div style={{ width: 15, height: 15, borderRadius: "50%", background: sw.sw3 }} />
                </div>
                <div style={{ padding: "13px 14px 15px" }}>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 17, color: "#281a0b" }}>{meta.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6f5c45", marginTop: 3 }}>{meta.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={dismissPicker} style={{ marginTop: 24, color: "#6f5c45", fontWeight: 800, fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3, background: "none", border: "none", cursor: "pointer" }}>{t.maybeLater}</button>
      </div>
    </div>
  );
}
