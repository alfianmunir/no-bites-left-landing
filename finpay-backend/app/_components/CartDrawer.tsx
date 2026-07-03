"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";
import { useClientSession } from "@/lib/useClientSession";
import SignInModal from "./SignInModal";

const THUMBS: Record<string, string> = {
  og: "/images/menu-og-c.png",
  hazel: "/images/menu-hazel-c.png",
  choco: "/images/menu-choco-c.png",
  matcha: "/images/menu-matcha-c.png",
};

function thumbFor(sku: string): string {
  const family = sku.split("-")[0];
  return THUMBS[family] ?? "/images/menu-og-c.png";
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function CartDrawer() {
  const { items, subtotal, isOpen, closeCart, setQty, removeItem } = useCart();
  const { session } = useClientSession();
  const [showSignIn, setShowSignIn] = useState(false);
  const router = useRouter();

  if (!isOpen) return null;

  function goToCheckout() {
    closeCart();
    router.push("/checkout/address");
  }

  function handleCheckout() {
    if (session === undefined) return; // still loading session
    if (session) {
      goToCheckout();
    } else {
      setShowSignIn(true);
    }
  }

  return (
    <>
      <div
        onClick={closeCart}
        style={{ position: "fixed", inset: 0, background: "rgba(29,19,10,0.45)", zIndex: 40 }}
      />
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          maxWidth: 480,
          margin: "0 auto",
          background: "var(--bg)",
          borderRadius: "28px 28px 0 0",
          boxShadow: "0 -20px 40px rgba(40,26,11,0.15)",
          display: "flex",
          flexDirection: "column",
          padding: "14px 20px 24px",
          maxHeight: "85vh",
        }}
      >
        <div
          onClick={closeCart}
          style={{ width: 40, height: 4, borderRadius: 99, background: "var(--line)", margin: "0 auto 14px", cursor: "pointer" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="font-display" style={{ fontSize: 19 }}>Your Cart ({items.reduce((s, l) => s + l.qty, 0)})</div>
          <button onClick={closeCart} className="icon-btn" style={{ border: "1.5px solid var(--line)" }}>✕</button>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 24,
                background:
                  "repeating-linear-gradient(45deg, var(--surface2), var(--surface2) 6px, var(--surface) 6px, var(--surface) 12px)",
                border: "1.5px solid var(--line)",
              }}
            />
            <div className="font-display" style={{ fontSize: 19 }}>Your cart&apos;s a little empty</div>
            <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 240 }}>
              Fresh cookies, brownies &amp; pie are just a scroll away.
            </div>
            <button onClick={closeCart} className="btn-primary" style={{ width: "auto", padding: "14px 28px" }}>
              Browse treats
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto", flex: 1 }}>
              {items.map((line) => (
                <div key={line.sku} className="card" style={{ display: "flex", gap: 12, alignItems: "center", borderRadius: 16 }}>
                  <img
                    src={thumbFor(line.sku)}
                    alt=""
                    style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{line.name}</div>
                    <div style={{ fontSize: 12, color: "var(--soft)" }}>{line.variant}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--line)", borderRadius: 99, overflow: "hidden" }}>
                        <button
                          onClick={() => (line.qty === 1 ? removeItem(line.sku) : setQty(line.sku, line.qty - 1))}
                          style={{ width: 26, height: 26, border: "none", background: "none", fontWeight: 800, color: line.qty === 1 ? "var(--red)" : "var(--soft)", cursor: "pointer" }}
                        >
                          {line.qty === 1 ? "🗑" : "−"}
                        </button>
                        <div style={{ width: 22, textAlign: "center", fontWeight: 800, fontSize: 13 }}>{line.qty}</div>
                        <button
                          onClick={() => setQty(line.sku, line.qty + 1)}
                          style={{ width: 26, height: 26, border: "none", background: "none", fontWeight: 800, color: "var(--orange)", cursor: "pointer" }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 14, whiteSpace: "nowrap" }}>{rupiah(line.unitPrice * line.qty)}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1.5px solid var(--line)", marginTop: 12, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--soft)" }}>
                <span>Subtotal</span>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>{rupiah(subtotal)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--soft)" }}>Shipping &amp; delivery date come next</div>
              <button onClick={handleCheckout} className="btn-primary" style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.12)" }}>
                Checkout · {rupiah(subtotal)}
              </button>
            </div>
          </>
        )}
      </div>

      {showSignIn && (
        <SignInModal
          onClose={() => setShowSignIn(false)}
          onSignedIn={() => {
            setShowSignIn(false);
            goToCheckout();
          }}
        />
      )}
    </>
  );
}
