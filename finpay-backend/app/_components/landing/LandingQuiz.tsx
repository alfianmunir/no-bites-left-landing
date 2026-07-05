"use client";

/**
 * Mood quiz ("Find your match") — intro → 3 questions → recommendation.
 * craving × mood → product (QUIZ_MAP); portion → suggested size. "Order this"
 * deep-links the pick into the cart when it's an orderable cookie, otherwise
 * scrolls to the menu (Apple Pie / Brownies aren't in the orderable catalog).
 */
import { useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";
import { useCart } from "@/lib/cart/CartContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";

type ProductId = "apple" | "og" | "choco" | "hazel" | "matcha" | "brownies";

interface QuizProduct { name: string; img: string; accent: string; sizeMe: string; sizeShare: string; skuBase?: string }

const QUIZ_PRODUCTS: Record<ProductId, QuizProduct> = {
  apple: { name: "Apple Pie", img: "/images/menu-apple-c.png", accent: "#e24026", sizeMe: "8 cm", sizeShare: "22 cm" },
  og: { name: "OG Cookies", img: "/images/menu-og-c.png", accent: "#f58c21", sizeMe: "40 g", sizeShare: "100 g", skuBase: "og" },
  choco: { name: "Choco Cookies", img: "/images/menu-choco-photo.jpg", accent: "#54300b", sizeMe: "40 g", sizeShare: "100 g", skuBase: "choco" },
  hazel: { name: "Hazel Cookies", img: "/images/menu-hazel-photo.jpg", accent: "#7a4a18", sizeMe: "40 g", sizeShare: "100 g", skuBase: "hazel" },
  matcha: { name: "Matcha Cookies", img: "/images/menu-matcha-c.png", accent: "#2d9322", sizeMe: "40 g", sizeShare: "100 g", skuBase: "matcha" },
  brownies: { name: "Fudgy Brownies Bites", img: "", accent: "#241504", sizeMe: "5 bites", sizeShare: "10 bites" },
};

const QUIZ_MAP: Record<string, Record<string, ProductId>> = {
  chocolatey: { cozy: "choco", indulgent: "brownies", adventurous: "brownies", pickmeup: "choco" },
  nutty: { cozy: "og", indulgent: "hazel", adventurous: "hazel", pickmeup: "hazel" },
  different: { cozy: "apple", indulgent: "matcha", adventurous: "matcha", pickmeup: "matcha" },
  classic: { cozy: "apple", indulgent: "og", adventurous: "og", pickmeup: "og" },
};
const FALLBACK: ProductId = "og";

export default function LandingQuiz() {
  const { t } = useLanding();
  const { addItem, notify } = useCart();
  const flow = useOrderFlow();
  const steps = t.quiz.steps;

  const [step, setStep] = useState(0); // 0 = intro, 1..3 = questions, 4 = result
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const start = () => { setAnswers({}); setStep(1); };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const pick = (key: string, v: string) => {
    const next = { ...answers, [key]: v };
    setAnswers(next);
    setStep((s) => s + 1);
  };
  const again = () => { setAnswers({}); setStep(1); };

  const productId: ProductId = QUIZ_MAP[answers.craving]?.[answers.mood] ?? FALLBACK;
  const product = QUIZ_PRODUCTS[productId];
  const share = answers.portion === "share";
  const size = share ? product.sizeShare : product.sizeMe;

  const goOrder = () => {
    if (product.skuBase) {
      const sku = `${product.skuBase}-${share ? "100" : "40"}`;
      addItem(sku, 1);
      notify(t.added.replace("%s", `${product.name} · ${size}`));
      flow.open("cart");
    } else {
      setStep(0);
      document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const shareLink = typeof window !== "undefined" ? window.location.origin + "/#match" : "";
  const shareWaLink = `https://wa.me/?text=${encodeURIComponent(t.quiz.shareText(product.name) + " " + shareLink)}`;
  const copyLink = () => {
    navigator.clipboard?.writeText(shareLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  };

  const inQuestion = step >= 1 && step <= steps.length;
  const atResult = step === steps.length + 1;
  const curStep = steps[step - 1];

  return (
    <section id="match" data-r="quiz-sec" style={{ maxWidth: 1000, margin: "0 auto", padding: "8px 44px 104px", scrollMarginTop: 72 }}>
      <div data-r="quiz-card" style={{ position: "relative", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 30, padding: 48, overflow: "hidden", minHeight: 430, display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", top: -40, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(245,140,33,0.10)", pointerEvents: "none" }} />

        {step === 0 && (
          <div data-r="quiz-intro" style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr", gap: 40, alignItems: "center", position: "relative", zIndex: 1, flex: 1 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--bg)", border: "1.5px solid var(--line)", color: "var(--orange)", fontWeight: 800, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 15px", borderRadius: 999 }}>{t.quiz.entryKicker}</div>
              <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 42, lineHeight: 1.05, margin: "18px 0 0", color: "var(--ink)", maxWidth: "16ch" }}>{t.quiz.entryTitle}</h2>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--soft)", margin: "14px 0 0", maxWidth: "46ch" }}>{t.quiz.entrySub}</p>
              <button onClick={start} style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 28, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 16, padding: "16px 30px", borderRadius: 999, border: "none", boxShadow: "0 5px 0 rgba(0,0,0,0.14)", cursor: "pointer" }}>{t.quiz.entryCta} →</button>
            </div>
            <div data-r="quiz-introart" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/images/mini-cookies.png" alt="" style={{ height: 140, animation: "bobx 4.4s ease-in-out infinite", filter: "drop-shadow(0 18px 24px rgba(40,26,11,0.18))" }} />
            </div>
          </div>
        )}

        {inQuestion && curStep && (
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={back} aria-label="Back" style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--soft)", fontWeight: 800, fontSize: 14, padding: "8px 12px", borderRadius: 10, background: "none", border: "none", cursor: "pointer" }}>← {t.quiz.back}</button>
              <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--bg)", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 999, background: "var(--orange)", width: `${(step / steps.length) * 100}%`, transition: "width .35s cubic-bezier(.2,.8,.2,1)" }} /></div>
              <div style={{ flex: "none", fontWeight: 800, fontSize: 13, color: "var(--soft)", whiteSpace: "nowrap" }}>{step} {t.quiz.of} {steps.length}</div>
            </div>
            <h2 className="font-display" style={{ fontWeight: 700, fontSize: 34, lineHeight: 1.1, margin: "30px 0 0", color: "var(--ink)", textAlign: "center" }}>{curStep.q}</h2>
            <div data-r="quiz-opts" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginTop: 26 }}>
              {curStep.opts.map((o) => (
                <button key={o.v} onClick={() => pick(curStep.key, o.v)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 22px", borderRadius: 18, border: "2px solid var(--line)", background: "var(--bg)", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 34, lineHeight: 1, flex: "none" }}>{o.emoji}</span>
                  <span className="font-display" style={{ fontWeight: 700, fontSize: 19, color: "var(--ink)" }}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {atResult && (
          <div data-r="quiz-result" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 40, alignItems: "center", flex: 1, animation: "popfade .4s ease" }}>
            <div data-r="quiz-resultimg" style={{ position: "relative", aspectRatio: "5/5", borderRadius: 24, border: "1.5px solid var(--line)", overflow: "hidden", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {product.img ? <img src={product.img} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src="/images/mini-brownies.png" alt={product.name} style={{ height: 90 }} />}
              <span style={{ position: "absolute", top: 14, left: 14, width: 14, height: 14, borderRadius: "50%", background: product.accent, boxShadow: "0 0 0 4px var(--surface)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.quiz.resultKicker}</div>
              <p style={{ fontSize: 16, color: "var(--soft)", margin: "10px 0 4px", fontWeight: 600 }}>{t.quiz.matchIntro}</p>
              <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 40, lineHeight: 1.04, margin: 0, color: "var(--ink)" }}>{product.name}</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: "var(--soft)", margin: "14px 0 0", maxWidth: "42ch" }}>{t.quiz.blurbs[productId]}</p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 18, background: "var(--bg)", border: "1.5px solid var(--line)", borderRadius: 12, padding: "10px 16px" }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--soft)" }}>{t.quiz.sizeLabel}</span>
                <span className="font-display" style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{size}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
                <button onClick={goOrder} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 16, padding: "15px 28px", borderRadius: 999, border: "none", boxShadow: "0 5px 0 rgba(0,0,0,0.14)", cursor: "pointer" }}>{t.quiz.orderCta} →</button>
                <button onClick={again} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink)", fontWeight: 800, fontSize: 15, padding: "15px 22px", borderRadius: 999, border: "2px solid var(--line)", background: "transparent", cursor: "pointer" }}>↺ {t.quiz.again}</button>
                <button onClick={() => setShareOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--soft)", fontWeight: 800, fontSize: 15, padding: "15px 18px", borderRadius: 999, background: "none", border: "none", cursor: "pointer" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg> {t.quiz.share}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {shareOpen && (
        <div onClick={() => setShareOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(20,13,6,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "drawerIn .22s ease" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 24, padding: 28, boxShadow: "0 30px 70px rgba(0,0,0,0.4)", animation: "popfade .28s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 className="font-display" style={{ fontWeight: 700, fontSize: 23, color: "var(--ink)", margin: 0 }}>{t.quiz.shareSheetTitle}</h3>
              <button onClick={() => setShareOpen(false)} aria-label="Close" style={{ flex: "none", width: 38, height: 38, borderRadius: 11, border: "1.5px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <input value={shareLink} readOnly onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, padding: "13px 15px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--bg)", color: "var(--soft)", fontSize: 14, fontWeight: 600, outline: "none" }} />
              <button onClick={copyLink} style={{ flex: "none", padding: "13px 18px", borderRadius: 12, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 14.5, cursor: "pointer", whiteSpace: "nowrap", border: "none" }}>{copied ? t.quiz.shareCopied : t.quiz.copyLink}</button>
            </div>
            <a href={shareWaLink} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 12, background: "#1faf54", color: "#fff", fontWeight: 800, fontSize: 15, padding: 14, borderRadius: 12, boxShadow: "0 4px 0 rgba(0,0,0,0.14)" }}>{t.quiz.shareWa}</a>
          </div>
        </div>
      )}
    </section>
  );
}
