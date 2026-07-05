"use client";

/**
 * Feedback form (ported). Client-side only — no feedback backend exists yet, so
 * on submit it validates (name + rating) and shows the thank-you state, matching
 * the prototype. Wire to a real endpoint later if feedback needs persisting.
 */
import { useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";

const FLAVOURS = ["Apple Pie", "OG Cookies", "Choco Cookies", "Hazel Cookies", "Matcha Cookies", "Fudgy Brownies Bites"];

export default function LandingFeedback() {
  const { t } = useLanding();
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [flavour, setFlavour] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const label: React.CSSProperties = { display: "block", fontWeight: 800, fontSize: 13, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--soft)", marginBottom: 8 };
  const input: React.CSSProperties = { width: "100%", padding: "14px 16px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 16, fontWeight: 600, marginBottom: 18, outline: "none" };

  const send = () => {
    if (!name.trim() || rating < 1) { setError(t.fbNeed); return; }
    setError("");
    setSending(true);
    // No feedback backend yet — simulate a send, then thank the customer.
    setTimeout(() => { setSending(false); setSent(true); }, 700);
  };
  const reset = () => { setRating(0); setName(""); setFlavour(""); setMsg(""); setSent(false); };

  return (
    <section id="feedback" data-r="feedback" style={{ maxWidth: 760, margin: "0 auto", padding: "104px 44px", scrollMarginTop: 72 }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.fbKicker}</div>
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 46, lineHeight: 1.05, margin: "14px 0 0", color: "var(--ink)" }}>{t.fbTitle}</h2>
        <p style={{ fontSize: 18, color: "var(--soft)", margin: "14px 0 0" }}>{t.fbSub}</p>
      </div>
      <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 26, padding: 34 }}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "18px 6px", animation: "popfade .3s ease" }}>
            <div style={{ width: 66, height: 66, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 34, color: "#fff", fontWeight: 800 }}>★</div>
            <h3 className="font-display" style={{ fontWeight: 700, fontSize: 28, margin: 0, color: "var(--ink)" }}>{t.thanks(name.trim())}</h3>
            <p style={{ fontSize: 16, color: "var(--soft)", lineHeight: 1.55, margin: "12px 0 22px" }}>{t.thanksSub(rating)}</p>
            <button onClick={reset} style={{ color: "var(--orange)", fontWeight: 800, fontSize: 15, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>{t.fbAnother}</button>
          </div>
        ) : (
          <div>
            <label style={{ ...label, marginBottom: 10 }}>{t.fbRatingL}</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} aria-label={`rate ${s}`} style={{ fontSize: 38, lineHeight: 1, color: s <= rating ? "var(--orange)" : "var(--line)", background: "none", border: "none", cursor: "pointer" }}>★</button>
              ))}
            </div>
            <label style={label}>{t.fbNameL}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.fbNameP} style={input} />
            <label style={label}>{t.fbFlavourL}</label>
            <select value={flavour} onChange={(e) => setFlavour(e.target.value)} style={{ ...input, cursor: "pointer" }}>
              <option value="">{t.fbFlavourP}</option>
              {FLAVOURS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <label style={label}>{t.fbMsgL}</label>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t.fbMsgP} rows={4} style={{ ...input, resize: "vertical" }} />
            <button onClick={send} disabled={sending} style={{ width: "100%", padding: 17, borderRadius: 14, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 18, border: "none", boxShadow: "0 5px 0 rgba(0,0,0,0.14)", cursor: "pointer" }}>{sending ? t.fbSending : t.fbSend}</button>
            {error && <p style={{ color: "var(--red)", fontSize: 13.5, fontWeight: 700, margin: "13px 0 0", textAlign: "center" }}>{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
