/**
 * Shop / catalog entry point for the ordering flow.
 *
 * The real product-catalog cards live on the marketing landing page (out of
 * scope here per PRD §8b) — this is a minimal on-brand grid of the 8 orderable
 * SKUs (lib/prices.ts) so the cart → checkout → pay → status flow has a real
 * "Browse" starting point inside this app. Replaces the old dev-checkout
 * harness now that the real cart exists.
 */
"use client";

import { listPriceItems } from "@/lib/prices";
import { useCart } from "@/lib/cart/CartContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";
import AppHeader from "./_components/AppHeader";

const PRICES = listPriceItems();

const THUMBS: Record<string, string> = {
  og: "/images/menu-og-c.png",
  hazel: "/images/menu-hazel-c.png",
  choco: "/images/menu-choco-c.png",
  matcha: "/images/menu-matcha-c.png",
};

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function ShopPage() {
  const { itemCount, subtotal, addItem } = useCart();
  const flow = useOrderFlow();

  const families = new Map<string, typeof PRICES>();
  for (const p of PRICES) {
    const family = p.sku.split("-")[0];
    families.set(family, [...(families.get(family) ?? []), p]);
  }

  return (
    <>
    <AppHeader />
    <main style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 100 }}>
      <div style={{ padding: "28px 20px 8px" }}>
        <div className="font-display" style={{ fontSize: 15, color: "var(--orange)" }}>No Bites Left</div>
        <div className="font-display" style={{ fontSize: 26, marginTop: 4 }}>Fresh, hand-baked cookies</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)", marginTop: 6 }}>
          Baked fresh to order — ready to collect 3 days after you order, at our Kebagusan pickup point.
        </div>
      </div>

      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {[...families.entries()].map(([family, variants]) => (
          <div key={family} className="card" style={{ display: "flex", gap: 14, padding: 14 }}>
            <img
              src={THUMBS[family]}
              alt=""
              style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{variants[0].name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {variants.map((v) => (
                  <div key={v.sku} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 13, color: "var(--soft)" }}>
                      {v.variant} <span style={{ color: "var(--ink)", fontWeight: 700 }}>· {rupiah(v.unitPrice)}</span>
                    </div>
                    <button
                      onClick={() => addItem(v.sku, 1)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 999,
                        border: "1.5px solid var(--orange)",
                        background: "#fff",
                        color: "var(--orange)",
                        fontWeight: 800,
                        fontSize: 12.5,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 20px", display: "flex", justifyContent: "center" }}>
        <button onClick={() => flow.open("orders")} style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", background: "transparent", border: "none", cursor: "pointer" }}>
          My Orders →
        </button>
      </div>

      {itemCount > 0 && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
            background: "linear-gradient(180deg, transparent, var(--bg) 30%)",
          }}
        >
          <button
            onClick={() => flow.open("cart")}
            className="btn-primary"
            style={{ maxWidth: 440, boxShadow: "0 4px 0 rgba(0,0,0,0.12)", display: "flex", justifyContent: "space-between", padding: "16px 22px" }}
          >
            <span>View cart ({itemCount})</span>
            <span>{rupiah(subtotal)}</span>
          </button>
        </div>
      )}
    </main>
    </>
  );
}
