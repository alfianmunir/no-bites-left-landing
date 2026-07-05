"use client";

/**
 * Menu section (ported from the prototype). Orderable items come from the real
 * server price list (lib/prices.ts) so add-to-cart → checkout stays consistent;
 * Apple Pie & Fudgy Brownies aren't in that list, so they render "coming soon".
 */
import { useState } from "react";
import { getPriceItem } from "@/lib/prices";
import { useLanding } from "@/lib/landing/LandingContext";
import { useCart } from "@/lib/cart/CartContext";

interface Family { key: string; img: string; accent: string; i18n: number; skus?: string[]; comingSoon?: boolean; fallbackName?: string }

// Display order matches the i18n t.menu[] array (apple, og, choco, hazel, matcha, brownies).
const FAMILIES: Family[] = [
  { key: "apple", img: "/images/menu-apple-c.png", accent: "#e24026", i18n: 0, comingSoon: true, fallbackName: "Apple Pie" },
  { key: "og", img: "/images/menu-og-c.png", accent: "#f58c21", i18n: 1, skus: ["og-40", "og-100"] },
  { key: "choco", img: "/images/menu-choco-c.png", accent: "#54300b", i18n: 2, skus: ["choco-40", "choco-100"] },
  { key: "hazel", img: "/images/menu-hazel-c.png", accent: "#7a4a18", i18n: 3, skus: ["hazel-40", "hazel-100"] },
  { key: "matcha", img: "/images/menu-matcha-c.png", accent: "#2d9322", i18n: 4, skus: ["matcha-40", "matcha-100"] },
  { key: "brownies", img: "", accent: "#241504", i18n: 5, comingSoon: true, fallbackName: "Fudgy Brownies Bites" },
];

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function MenuCard({ fam }: { fam: Family }) {
  const { t } = useLanding();
  const { addItem, notify } = useCart();
  const meta = t.menu[fam.i18n];
  const variants = (fam.skus ?? []).map((sku) => getPriceItem(sku)).filter(Boolean) as NonNullable<ReturnType<typeof getPriceItem>>[];
  const [sel, setSel] = useState(0);
  const name = variants[0]?.name ?? fam.fallbackName ?? "";
  const chosen = variants[sel];

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 24, overflow: "hidden", transition: "transform .18s ease, box-shadow .18s ease" }}>
      <div style={{ position: "relative", aspectRatio: "5/4", borderBottom: "1.5px solid var(--line)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {fam.comingSoon ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--soft)" }}>
            <img src="/images/mini-brownies.png" alt="" style={{ height: 38, opacity: 0.85 }} />
            <div className="font-display" style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{t.comingSoon}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{t.inOven}</div>
          </div>
        ) : (
          <img src={fam.img} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        <span style={{ position: "absolute", top: 13, left: 13, width: 13, height: 13, borderRadius: "50%", background: fam.accent, boxShadow: "0 0 0 4px var(--surface)" }} />
        {meta.tag && <span style={{ position: "absolute", top: 12, right: 12, color: "var(--bg)", fontWeight: 800, fontSize: 11, padding: "5px 10px", borderRadius: 999, background: "#e24126" }}>{meta.tag}</span>}
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>{name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, fontSize: 12.5, fontWeight: 800, color: "var(--soft)" }}><span style={{ color: fam.accent }}>●</span> {meta.note}</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--soft)", margin: "12px 0 0" }}>{meta.desc}</p>

        {variants.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--soft)", margin: "18px 0 8px" }}>{t.sizeLabel}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {variants.map((v, i) => {
                const on = i === sel;
                return (
                  <button key={v.sku} onClick={() => setSel(i)} title={v.variant} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: `1.5px solid ${on ? fam.accent : "var(--line)"}`, background: on ? fam.accent : "var(--surface)", color: on ? "#fff" : "var(--ink)" }}>
                    {v.variant}{i === 0 && <span style={{ fontSize: 11, lineHeight: 1, color: on ? "#fff" : "var(--orange)" }}>★</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 18, paddingTop: 16, borderTop: "1.5px solid var(--line)" }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--soft)", opacity: 0.72 }}>{t.priceWord}</span>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 23, color: "var(--orange)", whiteSpace: "nowrap" }}>{chosen ? rupiah(chosen.unitPrice) : "—"}</div>
        </div>

        {chosen ? (
          <button onClick={() => { addItem(chosen.sku, 1); notify(t.added.replace("%s", `${chosen.name} · ${chosen.variant}`)); }} style={{ marginTop: 16, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 14, borderRadius: 14, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 15, border: "none", boxShadow: "0 4px 0 rgba(0,0,0,0.12)", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            {t.addToCart}
          </button>
        ) : (
          <div style={{ marginTop: 16, width: "100%", textAlign: "center", padding: 14, borderRadius: 14, background: "var(--surface2)", color: "var(--soft)", fontWeight: 800, fontSize: 14, border: "1.5px solid var(--line)" }}>🧑‍🍳 {t.notifyOven}</div>
        )}
      </div>
    </div>
  );
}

export default function LandingMenu() {
  const { t } = useLanding();
  return (
    <section id="menu" data-r="menu-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 44px 104px", scrollMarginTop: 72 }}>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 52px" }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.menuKicker}</div>
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 52, lineHeight: 1.04, margin: "14px 0 0", color: "var(--ink)" }}>{t.menuTitle}</h2>
        <p style={{ fontSize: 18, color: "var(--soft)", margin: "16px 0 0" }}>{t.menuSub}</p>
      </div>
      <div data-r="menu-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 26 }}>
        {FAMILIES.map((fam) => <MenuCard key={fam.key} fam={fam} />)}
      </div>
    </section>
  );
}
