"use client";

/**
 * Feedback showcase (design handoff): rating summary strip + an animated wall of
 * real customer reviews (from the feedback table via GET /api/feedback) + the
 * submission form. Row rules: ≤6 reviews → 1 marquee row; >6 → 2 rows split
 * equally with the odd leftover on the first row. Marquee is pure CSS (pauses on
 * hover, respects prefers-reduced-motion).
 */
import { useEffect, useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";
import Captcha, { captchaEnabled } from "@/app/_components/Captcha";

const FLAVOURS = ["Apple Pie", "OG Cookies", "Choco Cookies", "Hazel Cookies", "Matcha Cookies", "Fudgy Brownies Bites"];
const AVATAR_COLORS = ["var(--orange)", "var(--choco)", "var(--green)", "var(--blue)"];

interface Review { name: string; rating: number; flavour: string | null; message: string | null; createdAt: string }

function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  const s = w.length >= 2 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <div style={{ color: "var(--orange)", fontSize: size, letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ color: s <= rating ? "var(--orange)" : "var(--line)" }}>★</span>
      ))}
    </div>
  );
}

function ReviewCard({ r, index }: { r: Review; index: number }) {
  const meta = r.flavour ? `${r.flavour} · Direct` : "Direct";
  return (
    <div style={{ flex: "0 0 336px", width: 336, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 20, padding: "24px 24px 26px", boxShadow: "0 12px 34px rgba(40,26,11,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: AVATAR_COLORS[index % AVATAR_COLORS.length], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{initials(r.name)}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)" }}>{r.name}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soft)" }}>{meta}</div>
        </div>
      </div>
      <div style={{ marginBottom: 11 }}><Stars rating={r.rating} /></div>
      <p style={{ fontSize: 14.5, lineHeight: 1.62, color: "var(--ink)", margin: 0 }}>{r.message}</p>
    </div>
  );
}

function ReviewRow({ reviews, startIndex, duration, reverse, marginBottom }: { reviews: Review[]; startIndex: number; duration: number; reverse?: boolean; marginBottom: number }) {
  // Card list rendered twice back-to-back; the marquee keyframe translates 0 → -50%
  // so the second copy lands where the first started → seamless loop.
  const twice = [...reviews, ...reviews];
  return (
    <div className="nbl-review-row" style={{ overflow: "hidden", margin: `0 -44px ${marginBottom}px`, WebkitMaskImage: "linear-gradient(90deg,transparent 0,#000 7%,#000 93%,transparent 100%)", maskImage: "linear-gradient(90deg,transparent 0,#000 7%,#000 93%,transparent 100%)" }}>
      <div className="nbl-review-track" style={{ display: "flex", gap: 20, width: "max-content", padding: reverse ? "0 44px 14px" : "14px 44px", willChange: "transform", animation: `marquee ${duration}s linear infinite${reverse ? " reverse" : ""}` }}>
        {twice.map((r, i) => <ReviewCard key={i} r={r} index={startIndex + (i % reviews.length)} />)}
      </div>
    </div>
  );
}

export default function LandingFeedback() {
  const { t } = useLanding();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [flavour, setFlavour] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [hp, setHp] = useState(""); // honeypot — must stay empty for real users
  const [captchaToken, setCaptchaToken] = useState("");

  useEffect(() => {
    fetch("/api/feedback").then((r) => r.json()).then((d) => setReviews(d.reviews ?? [])).catch(() => setReviews([]));
  }, []);

  // Row split (per spec): ≤6 → 1 row; >6 → 2 rows, odd leftover on row 1.
  let row1: Review[] = [];
  let row2: Review[] = [];
  if (reviews.length > 6) {
    const half = Math.ceil(reviews.length / 2);
    row1 = reviews.slice(0, half);
    row2 = reviews.slice(half);
  } else {
    row1 = reviews;
  }

  const label: React.CSSProperties = { display: "block", fontWeight: 800, fontSize: 13, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--soft)", marginBottom: 8 };
  const input: React.CSSProperties = { width: "100%", padding: "14px 16px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 16, fontWeight: 600, marginBottom: 18, outline: "none" };

  const send = async () => {
    if (!name.trim() || rating < 1) { setError(t.fbNeed); return; }
    if (captchaEnabled && !captchaToken) { setError("Please complete the captcha"); return; }
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, name: name.trim(), flavour, message: msg, hp, captchaToken }) });
      if (!res.ok) { setSending(false); setError(t.fbNeed); return; }
      setSending(false);
      setSent(true);
    } catch {
      setSending(false);
      setError(t.fbNeed);
    }
  };
  const reset = () => { setRating(0); setName(""); setFlavour(""); setMsg(""); setSent(false); };

  return (
    <section id="feedback" data-r="feedback" style={{ maxWidth: 1140, margin: "0 auto", padding: "104px 44px", scrollMarginTop: 72 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.fbKicker}</div>
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 46, lineHeight: 1.05, margin: "14px 0 0", color: "var(--ink)" }}>{t.fbTitle}</h2>
        <p style={{ fontSize: 18, color: "var(--soft)", margin: "14px 0 0" }}>{t.fbSub}</p>
      </div>

      {/* rating summary strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "20px 34px", flexWrap: "wrap", margin: "0 auto 46px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 62, lineHeight: 0.9, color: "var(--ink)" }}>4.9</div>
          <div>
            <div style={{ color: "var(--orange)", fontSize: 19, letterSpacing: 3 }}>★★★★★</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--soft)", marginTop: 5 }}>{t.fbAvgLabel}</div>
          </div>
        </div>
        <div style={{ width: 1.5, height: 44, background: "var(--line)" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Shopee Food", "GrabFood", "Direct"].map((c) => (
            <span key={c} style={{ padding: "8px 15px", borderRadius: 999, background: "var(--surface)", border: "1.5px solid var(--line)", fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>{c}</span>
          ))}
        </div>
      </div>

      {/* animated review wall */}
      {reviews.length > 0 && (
        <>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--ink)", textAlign: "center", marginBottom: 22 }}>{t.fbWallTitle}</div>
          {row1.length > 0 && <ReviewRow reviews={row1} startIndex={0} duration={46} marginBottom={row2.length > 0 ? 20 : 56} />}
          {row2.length > 0 && <ReviewRow reviews={row2} startIndex={row1.length} duration={52} reverse marginBottom={56} />}
        </>
      )}

      {/* submission form */}
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h3 className="font-display" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.05, margin: 0, color: "var(--ink)" }}>{t.fbShareTitle}</h3>
          <p style={{ fontSize: 15.5, color: "var(--soft)", margin: "9px 0 0" }}>{t.fbShareSub}</p>
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
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
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
              <Captcha onToken={setCaptchaToken} />
              <button onClick={send} disabled={sending} style={{ width: "100%", padding: 17, borderRadius: 14, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 18, border: "none", boxShadow: "0 5px 0 rgba(0,0,0,0.14)", cursor: "pointer" }}>{sending ? t.fbSending : t.fbSend}</button>
              {error && <p style={{ color: "var(--red)", fontSize: 13.5, fontWeight: 700, margin: "13px 0 0", textAlign: "center" }}>{error}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
