"use client";

import { useCart } from "@/lib/cart/CartContext";

export default function Toasts() {
  const { toasts, dismissToast } = useCart();
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        zIndex: 60,
        pointerEvents: "none",
        padding: "0 16px",
      }}
    >
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            background: "var(--dark)",
            color: "var(--on-dark)",
            borderRadius: 14,
            padding: "13px 16px",
            boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
            opacity: i === toasts.length - 1 ? 1 : 0.55,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.message}</span>
          {t.undo && (
            <button
              onClick={() => {
                t.undo?.();
                dismissToast(t.id);
              }}
              style={{
                background: "none",
                border: "none",
                fontWeight: 900,
                fontSize: 13,
                color: "#ffcf8a",
                cursor: "pointer",
              }}
            >
              UNDO
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
