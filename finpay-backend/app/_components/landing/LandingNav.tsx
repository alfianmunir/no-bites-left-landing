"use client";

/**
 * Landing top nav (ported from the prototype): links, theme palette cycle,
 * Classic/Playful vibe toggle, EN/ID language, cart, and auth — wired to the
 * real Cart / Auth / OrderFlow contexts. Collapses to a burger below 1200px.
 */
import { useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";
import { THEME_ORDER } from "@/lib/landing/themes";
import { useCart } from "@/lib/cart/CartContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";

const NAV_LINKS: { href: string; key: "navMenu" | "navMatch" | "navInside" | "navStory" | "navCafes" | "navFeedback" }[] = [
  { href: "#menu", key: "navMenu" },
  { href: "#match", key: "navMatch" },
  { href: "#inside", key: "navInside" },
  { href: "#story", key: "navStory" },
  { href: "#cafes", key: "navCafes" },
  { href: "#feedback", key: "navFeedback" },
];

const PALETTE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="17.5" cy="10.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="6.5" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
    <path d="M12 2a10 10 0 1 0 0 20c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16a6 6 0 0 0 6-6c0-4.4-4.5-8-10-8z" />
  </svg>
);

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "6px 13px", borderRadius: 999, fontWeight: 800, fontSize: 13, letterSpacing: "0.02em",
    background: active ? "var(--ink)" : "transparent", color: active ? "var(--bg)" : "var(--soft)", border: "none", cursor: "pointer",
  };
}

export default function LandingNav() {
  const { t, lang, setLang, theme, setTheme, playful, setPlayful } = useLanding();
  const { itemCount } = useCart();
  const { user, signInWithGoogle, signOut } = useAuth();
  const flow = useOrderFlow();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);

  const cyclePalette = () => {
    const i = THEME_ORDER.indexOf(theme);
    setPlayful(false);
    setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  };

  return (
    <>
      <nav data-r="nav" style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 44px", background: "var(--bg)", borderBottom: "1.5px solid var(--line)" }}>
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/images/logo-cookies.png" alt="No Bites Left" style={{ height: 38, width: "auto" }} />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div data-r="nav-links" style={{ display: "flex", gap: 24, fontWeight: 700, fontSize: 14.5, color: "var(--soft)" }}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} style={{ opacity: 0.85 }}>{t[l.key]}</a>
            ))}
          </div>
          <button data-r="palette" onClick={cyclePalette} aria-label={t.changeTheme} title={t.changeTheme} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--soft)" }}>{PALETTE_ICON}</button>
          <div data-r="vibe" role="group" aria-label={t.vibeLabel} style={{ display: "flex", alignItems: "center", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 999, padding: 3 }}>
            <button onClick={() => setPlayful(false)} aria-pressed={!playful} style={pill(!playful)}>{t.classicMode}</button>
            <button onClick={() => setPlayful(true)} aria-pressed={playful} style={{ ...pill(playful), display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden>✦</span>{t.playfulMode}</button>
          </div>
          <div data-r="lang" style={{ display: "flex", alignItems: "center", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 999, padding: 3 }}>
            <button onClick={() => setLang("en")} style={pill(lang === "en")}>EN</button>
            <button onClick={() => setLang("id")} style={pill(lang === "id")}>ID</button>
          </div>
          <button onClick={() => flow.open("cart")} data-r="cart-btn" aria-label={t.authCart} title={t.authCart} style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 999, border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            {itemCount > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 19, height: 19, padding: "0 5px", borderRadius: 999, background: "var(--orange)", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bg)" }}>{itemCount}</span>}
          </button>
          <div data-r="auth-desktop" style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
            {user ? (
              <>
                <button onClick={() => flow.open("orders")} data-r="myorders-link" style={{ fontWeight: 800, fontSize: 14, color: "var(--soft)", background: "none", border: "none", cursor: "pointer" }}>{t.authMyOrders}</button>
                <button onClick={() => setAcctOpen((v) => !v)} aria-label="Account" style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--choco)", color: "#fff", border: "none", fontFamily: "'Gorditas'", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{(user.name?.[0] ?? "S").toUpperCase()}</button>
                {acctOpen && (
                  <div onClick={() => setAcctOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 70, right: 44, width: 238, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 16, boxShadow: "0 18px 44px rgba(40,26,11,0.22)", overflow: "hidden", animation: "popfade .16s ease" }}>
                      <div style={{ padding: "14px 16px", borderBottom: "1.5px solid var(--line)" }}><div style={{ fontWeight: 900, fontSize: 14 }}>{user.name}</div><div style={{ fontSize: 12, color: "var(--soft)" }}>{user.email}</div></div>
                      <button onClick={() => { setAcctOpen(false); flow.open("orders"); }} style={acctItem}>🧾 &nbsp;{t.authMyOrders}</button>
                      <button onClick={() => { setAcctOpen(false); flow.open("profile"); }} style={acctItem}>👤 &nbsp;{t.authProfile}</button>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", fontWeight: 700, fontSize: 14, color: "var(--soft)", opacity: 0.65 }} title="Coming soon"><span>📍 &nbsp;{t.authSavedAddr}</span><span style={{ fontSize: 9.5, fontWeight: 900, background: "var(--surface2)", border: "1.5px solid var(--line)", borderRadius: 999, padding: "2px 7px" }}>SOON</span></div>
                      <button onClick={async () => { setAcctOpen(false); await signOut(); }} style={{ ...acctItem, borderTop: "1.5px solid var(--line)", color: "var(--red)" }}>↩ &nbsp;{t.authSignOut}</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button onClick={() => signInWithGoogle("/")} style={{ padding: "10px 18px", borderRadius: 999, background: "var(--surface)", border: "1.5px solid var(--line)", fontWeight: 800, fontSize: 14, color: "var(--choco)", cursor: "pointer" }}>{t.authSignIn}</button>
            )}
          </div>
          <button data-r="burger" onClick={() => setMenuOpen(true)} aria-label="Open menu" style={{ display: "none", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(20,13,6,0.5)", animation: "drawerIn .2s ease" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(82vw,320px)", background: "var(--bg)", boxShadow: "-10px 0 40px rgba(0,0,0,0.25)", padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, animation: "panelIn .26s cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <img src="/images/logo-cookies.png" alt="" style={{ height: 34 }} />
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" style={{ width: 40, height: 40, borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{ padding: "14px 12px", borderRadius: 12, fontWeight: 800, fontSize: 18, color: "var(--ink)" }}>{t[l.key]}</a>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => setLang("en")} style={{ flex: 1, padding: 11, borderRadius: 12, fontWeight: 800, fontSize: 15, border: "1.5px solid var(--line)", ...pill(lang === "en") }}>English</button>
              <button onClick={() => setLang("id")} style={{ flex: 1, padding: 11, borderRadius: 12, fontWeight: 800, fontSize: 15, border: "1.5px solid var(--line)", ...pill(lang === "id") }}>Indonesia</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setPlayful(false)} style={{ flex: 1, padding: 11, borderRadius: 12, fontWeight: 800, fontSize: 15, border: "1.5px solid var(--line)", ...pill(!playful) }}>{t.classicMode}</button>
              <button onClick={() => setPlayful(true)} style={{ flex: 1, padding: 11, borderRadius: 12, fontWeight: 800, fontSize: 15, border: "1.5px solid var(--line)", ...pill(playful) }}>✦ {t.playfulMode}</button>
            </div>
            <div style={{ height: 1.5, background: "var(--line)", margin: "14px 12px 4px" }} />
            {user ? (
              <>
                <button onClick={() => { setMenuOpen(false); flow.open("orders"); }} style={{ textAlign: "left", padding: "13px 12px", borderRadius: 12, border: "none", background: "none", fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>🧾 &nbsp;{t.authMyOrders}</button>
                <button onClick={() => { setMenuOpen(false); flow.open("profile"); }} style={{ textAlign: "left", padding: "13px 12px", borderRadius: 12, border: "none", background: "none", fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>👤 &nbsp;{t.authProfile}</button>
                <button onClick={async () => { setMenuOpen(false); await signOut(); }} style={{ textAlign: "left", padding: "13px 12px", borderRadius: 12, border: "none", background: "none", fontWeight: 800, fontSize: 16, color: "var(--red)" }}>↩ &nbsp;{t.authSignOut}</button>
              </>
            ) : (
              <button onClick={() => { setMenuOpen(false); signInWithGoogle("/"); }} style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 0", padding: "14px 12px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontWeight: 800, fontSize: 16 }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: "conic-gradient(#4285F4 0 25%,#34A853 25% 50%,#FBBC05 50% 75%,#EA4335 75% 100%)" }} />{t.authSignIn}</button>
            )}
            <button onClick={() => { setMenuOpen(false); flow.open("cart"); }} style={{ marginTop: 12, textAlign: "center", background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 17, padding: 15, borderRadius: 999, border: "none", boxShadow: "0 4px 0 rgba(0,0,0,0.12)" }}>{t.orderNow}</button>
          </div>
        </div>
      )}
    </>
  );
}

const acctItem: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 14, color: "var(--ink)", background: "none", border: "none", cursor: "pointer" };
