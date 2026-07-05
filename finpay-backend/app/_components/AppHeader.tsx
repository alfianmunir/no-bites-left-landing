"use client";

/**
 * Landing header — brand, cart button (live badge), and the account menu.
 * Signing in stays on the landing page (PRD §1): the only additions when signed
 * in are Profile / My Orders / Address book (disabled "coming soon").
 */
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";

export default function AppHeader() {
  const { itemCount, openCart } = useCart();
  const { user, signInWithGoogle, signOut } = useAuth();
  const flow = useOrderFlow();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keep openCart (CartContext) working, but the drawer is driven by OrderFlow.
  const handleCart = () => {
    openCart();
    flow.open("cart");
  };

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--bg)", borderBottom: "1.5px solid var(--line)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="font-display" style={{ fontSize: 20, color: "var(--choco)" }}>No Bites Left</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }} ref={ref}>
          <button onClick={handleCart} style={{ position: "relative", width: 40, height: 40, borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--surface)", cursor: "pointer", fontSize: 17 }} aria-label="cart">
            🛒
            {itemCount > 0 && (
              <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--orange)", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{itemCount}</span>
            )}
          </button>

          {user ? (
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen((v) => !v)} style={{ width: 40, height: 40, borderRadius: "50%", border: "1.5px solid var(--line)", background: "var(--choco)", color: "#fff", cursor: "pointer", fontWeight: 900, fontSize: 15 }} aria-label="account">
                {(user.name?.[0] ?? "?").toUpperCase()}
              </button>
              {menuOpen && (
                <div style={{ position: "absolute", right: 0, top: 48, width: 220, background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 16, boxShadow: "0 18px 44px rgba(40,26,11,0.22)", padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--soft)" }}>{user.email}</div>
                  <button onClick={() => { setMenuOpen(false); flow.open("profile"); }} style={menuItem}>👤 Profile</button>
                  <button onClick={() => { setMenuOpen(false); flow.open("orders"); }} style={menuItem}>🧾 Order tracking</button>
                  <div style={{ ...menuItem, color: "var(--soft)", display: "flex", justifyContent: "space-between", cursor: "default" }}>
                    <span>📍 Address book</span>
                    <span className="pill" style={{ background: "var(--surface2)", border: "1.5px solid var(--line)", fontSize: 10 }}>SOON</span>
                  </div>
                  <button onClick={async () => { setMenuOpen(false); await signOut(); }} style={{ ...menuItem, color: "var(--red)" }}>Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => signInWithGoogle("/")} className="btn-outline" style={{ padding: "10px 16px", borderRadius: 999 }}>Sign in</button>
          )}
        </div>
      </div>
    </header>
  );
}

const menuItem: React.CSSProperties = {
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: 10,
  padding: "10px 10px",
  fontSize: 13.5,
  fontWeight: 700,
  color: "var(--ink)",
  cursor: "pointer",
};
