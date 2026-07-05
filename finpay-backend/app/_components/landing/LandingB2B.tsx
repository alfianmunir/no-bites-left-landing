"use client";

/**
 * B2B / wholesale section (#cafes) + tasting-request modal (ported). The form is
 * client-side (no B2B backend yet) — validates required fields and shows the
 * success state, with a WhatsApp fallback throughout. Partner proof is off until
 * real partners are confirmed (prototype's showPartners=false).
 */
import { useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";

const WA_NUMBER = "6281776376636";

const WaIcon = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-2.4 3.6c-.2 0-.5 0-.7.4-.2.4-.9 1-.9 2.3s1 2.6 1.1 2.8c.1.2 1.9 3 4.7 4 .7.3 1.2.5 1.6.3.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.7-.3s-1.1-.5-1.3-.6c-.2-.1-.4-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1-.7-.3-1.4-.6-2-1.4-.2-.3.1-.4.3-.7l.3-.5v-.4l-.7-1.7c-.2-.4-.3-.4-.5-.4z" /></svg>
);

export default function LandingB2B() {
  const { t, lang } = useLanding();
  const b = t.b2b;
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lang === "id" ? "Halo No Bites Left, saya punya kafe dan ingin menjadwalkan tasting gratis." : "Hi No Bites Left, I run a cafe and would like to book a free tasting.")}`;

  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", role: "", cafe: "", city: "", contact: "", volume: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim() || !form.role || !form.cafe.trim() || !form.city.trim() || !form.contact.trim()) { setError(b.errReq); return; }
    setError("");
    setSent(true); // no B2B backend yet — confirm to the user; WhatsApp is the live path
  };
  const close = () => { setOpen(false); setSent(false); setError(""); };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "13px 15px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 15.5, fontWeight: 600, outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 800, fontSize: 12, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--soft)", marginBottom: 7 };
  const ctaBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, background: "#e24126", color: "#fff", fontWeight: 800, fontSize: 16, padding: "16px 28px", borderRadius: 999, border: "none", boxShadow: "0 5px 0 rgba(0,0,0,0.32)", cursor: "pointer" };

  return (
    <section id="cafes" data-r="b2b-sec" style={{ background: "linear-gradient(165deg,#2e1d0d 0%,#1c1107 100%)", color: "#f4ebdd", padding: "104px 44px", scrollMarginTop: 72, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div data-r="b2b-head" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 48, alignItems: "end" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid rgba(245,140,33,0.5)", color: "#f9b067", fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 15px", borderRadius: 999 }}>{b.tag}</div>
            <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 50, lineHeight: 1.04, margin: "20px 0 0", color: "#fff", maxWidth: "15ch" }}>{b.head}</h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(244,235,221,0.74)", margin: "18px 0 0", maxWidth: "50ch" }}>{b.sub}</p>
          </div>
          <div data-r="b2b-headcta" style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(true)} style={ctaBtn}>{b.cta} →</button>
          </div>
        </div>

        <div data-r="b2b-value" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 28, marginTop: 46, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(244,235,221,0.14)", borderRadius: 24, padding: "30px 34px" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,235,221,0.6)" }}>{b.valueKicker}</div>
              <span style={{ background: "rgba(45,147,34,0.22)", color: "#86d977", border: "1.5px solid rgba(45,147,34,0.5)", fontWeight: 800, fontSize: 11.5, padding: "5px 11px", borderRadius: 999, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.valuePill}</span>
            </div>
            <h3 className="font-display" style={{ fontWeight: 700, fontSize: 30, color: "#fff", margin: "12px 0 0", lineHeight: 1.1 }}>{b.valueHead}</h3>
            <p style={{ fontSize: 15.5, color: "rgba(244,235,221,0.72)", margin: "10px 0 0", lineHeight: 1.55, maxWidth: "62ch" }}>{b.valueBody}</p>
          </div>
          <div data-r="b2b-tasting" style={{ flex: "none", display: "flex", alignItems: "center", borderLeft: "1.5px solid rgba(244,235,221,0.16)", paddingLeft: 28 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, maxWidth: 230 }}>
              <span style={{ color: "#f9b067", fontSize: 17, lineHeight: 1.4, flex: "none" }}>✦</span>
              <span className="font-display" style={{ fontWeight: 700, fontSize: 17, color: "#f9b067", lineHeight: 1.35 }}>{b.valueTasting}</span>
            </div>
          </div>
        </div>

        <div data-r="b2b-cols" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, marginTop: 28 }}>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(244,235,221,0.12)", borderRadius: 24, padding: "30px 32px" }}>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f9b067" }}>{b.howTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              {b.steps.map((st) => (
                <div key={st.n} style={{ display: "flex", gap: 18, alignItems: "flex-start", padding: "16px 0", borderTop: "1.5px solid rgba(244,235,221,0.1)" }}>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: "#f9b067", flex: "none", width: 34 }}>{st.n}</div>
                  <div>
                    <div className="font-display" style={{ fontWeight: 700, fontSize: 19, color: "#fff" }}>{st.t}</div>
                    <div style={{ fontSize: 14.5, color: "rgba(244,235,221,0.66)", marginTop: 3, lineHeight: 1.5 }}>{st.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(244,235,221,0.12)", borderRadius: 24, padding: "30px 32px" }}>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f9b067" }}>{b.factsTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {b.facts.map((f) => (
                <div key={f.k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "16px 0", borderBottom: "1.5px solid rgba(244,235,221,0.1)" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(244,235,221,0.62)" }}>{f.k}</span>
                  <span style={{ textAlign: "right" }}><span className="font-display" style={{ fontWeight: 700, fontSize: 20, color: "#fff", display: "block" }}>{f.v}</span><span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(244,235,221,0.55)" }}>{f.s}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div data-r="b2b-final" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24, marginTop: 44, background: "linear-gradient(120deg,rgba(245,140,33,0.18),rgba(226,65,38,0.14))", border: "1.5px solid rgba(245,140,33,0.42)", borderRadius: 24, padding: "34px 36px" }}>
          <div>
            <h3 className="font-display" style={{ fontWeight: 700, fontSize: 30, color: "#fff", margin: 0 }}>{b.finalTitle}</h3>
            <p style={{ fontSize: 16, color: "rgba(244,235,221,0.76)", margin: "8px 0 0" }}>{b.finalSub}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <button onClick={() => setOpen(true)} style={{ ...ctaBtn, fontSize: 17, padding: "17px 30px" }}>{b.cta} →</button>
            <a href={waLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#86d977", fontWeight: 800, fontSize: 14 }}><WaIcon size={17} /> {b.waBtn}</a>
          </div>
        </div>
      </div>

      {open && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(20,13,6,0.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto", animation: "drawerIn .25s ease" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 26, padding: 32, boxShadow: "0 30px 70px rgba(0,0,0,0.4)", animation: "popfade .3s ease", color: "var(--ink)" }}>
            {sent ? (
              <div style={{ textAlign: "center", padding: "14px 6px", animation: "popfade .3s ease" }}>
                <div style={{ width: 66, height: 66, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: "#fff" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 13 10 18 19 6" /></svg></div>
                <h3 className="font-display" style={{ fontWeight: 700, fontSize: 27, margin: 0, color: "var(--ink)" }}>{b.successTitle}</h3>
                <p style={{ fontSize: 16, color: "var(--soft)", lineHeight: 1.55, margin: "12px auto 0", maxWidth: "34ch" }}>{b.successSub}</p>
                <a href={waLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, background: "#1faf54", color: "#fff", fontWeight: 800, fontSize: 15, padding: "14px 24px", borderRadius: 999, boxShadow: "0 4px 0 rgba(0,0,0,0.16)" }}><WaIcon size={17} /> {b.successWa}</a>
                <div style={{ marginTop: 18 }}><button onClick={close} style={{ color: "var(--soft)", fontWeight: 800, fontSize: 14, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>{b.close}</button></div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)" }}>{b.tag}</div>
                    <h3 className="font-display" style={{ fontWeight: 700, fontSize: 27, color: "var(--ink)", margin: "8px 0 0" }}>{b.formTitle}</h3>
                  </div>
                  <button onClick={close} aria-label="Close" style={{ flex: "none", width: 40, height: 40, borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 24, lineHeight: 1 }}>×</button>
                </div>
                <p style={{ fontSize: 15, color: "var(--soft)", margin: "10px 0 22px", lineHeight: 1.5 }}>{b.formSub}</p>
                <div data-r="b2b-formgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div><label style={labelStyle}>{b.fName}</label><input value={form.name} onChange={set("name")} style={inputStyle} /></div>
                  <div><label style={labelStyle}>{b.fRole}</label><select value={form.role} onChange={set("role")} style={{ ...inputStyle, cursor: "pointer" }}><option value="">{b.rolePlaceholder}</option>{b.roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div><label style={labelStyle}>{b.fCafe}</label><input value={form.cafe} onChange={set("cafe")} style={inputStyle} /></div>
                  <div><label style={labelStyle}>{b.fCity}</label><input value={form.city} onChange={set("city")} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>{b.fContact}</label><input value={form.contact} onChange={set("contact")} style={inputStyle} /></div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>{b.fVolume} · {b.fVolumeOpt}</label>
                  <select value={form.volume} onChange={set("volume")} style={{ ...inputStyle, cursor: "pointer" }}><option value="">—</option>{b.volOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                </div>
                <button onClick={submit} style={{ width: "100%", marginTop: 22, padding: 16, borderRadius: 14, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 17, border: "none", boxShadow: "0 5px 0 rgba(0,0,0,0.14)", cursor: "pointer" }}>{b.submit}</button>
                {error && <p style={{ color: "var(--red)", fontSize: 13.5, fontWeight: 700, margin: "13px 0 0", textAlign: "center" }}>{error}</p>}
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <a href={waLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--green)", fontWeight: 800, fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3 }}><WaIcon size={15} /> {b.waBtn}</a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
