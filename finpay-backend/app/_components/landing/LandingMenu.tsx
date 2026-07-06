"use client";

/**
 * Menu section — now DB-driven (Phase 1). Fetches families from GET /api/menu
 * (auto-seeded from the catalog); add/edit rows in the DB to change the menu.
 * Orderable families have variants + prices; others render "coming soon".
 * Prices shown here are display-only — POST /api/orders recomputes server-side.
 */
import { useEffect, useState } from "react";
import { useLanding } from "@/lib/landing/LandingContext";
import { useCart } from "@/lib/cart/CartContext";

interface Variant { sku: string; variant: string | null; unitPrice: number }
interface FamilyGroup {
  family: string; name: string; image: string; accent: string;
  tag: string | null; tagId: string | null; note: string | null; noteId: string | null;
  description: string | null; descriptionId: string | null; available: boolean; variants: Variant[];
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function MenuCard({ fam }: { fam: FamilyGroup }) {
  const { t, lang } = useLanding();
  const { addItem, notify } = useCart();
  const [sel, setSel] = useState(0);
  const isId = lang === "id";
  const tag = (isId ? fam.tagId : fam.tag) || fam.tag || "";
  const note = (isId ? fam.noteId : fam.note) || fam.note || "";
  const desc = (isId ? fam.descriptionId : fam.description) || fam.description || "";
  const chosen = fam.variants[sel];

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 24, overflow: "hidden", transition: "transform .18s ease, box-shadow .18s ease" }}>
      <div style={{ position: "relative", aspectRatio: "5/4", borderBottom: "1.5px solid var(--line)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {fam.available ? (
          <img src={fam.image} alt={fam.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--soft)" }}>
            <img src="/images/mini-brownies.png" alt="" style={{ height: 38, opacity: 0.85 }} />
            <div className="font-display" style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{t.comingSoon}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{t.inOven}</div>
          </div>
        )}
        <span style={{ position: "absolute", top: 13, left: 13, width: 13, height: 13, borderRadius: "50%", background: fam.accent, boxShadow: "0 0 0 4px var(--surface)" }} />
        {tag && <span style={{ position: "absolute", top: 12, right: 12, color: "var(--bg)", fontWeight: 800, fontSize: 11, padding: "5px 10px", borderRadius: 999, background: "#e24126" }}>{tag}</span>}
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", flex: 1 }}>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>{fam.name}</div>
        {note && <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, fontSize: 12.5, fontWeight: 800, color: "var(--soft)" }}><span style={{ color: fam.accent }}>●</span> {note}</div>}
        {desc && <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--soft)", margin: "12px 0 0" }}>{desc}</p>}

        {fam.variants.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--soft)", margin: "18px 0 8px" }}>{t.sizeLabel}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {fam.variants.map((v, i) => {
                const on = i === sel;
                return (
                  <button key={v.sku} onClick={() => setSel(i)} title={v.variant ?? ""} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: `1.5px solid ${on ? fam.accent : "var(--line)"}`, background: on ? fam.accent : "var(--surface)", color: on ? "#fff" : "var(--ink)" }}>
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
          <button onClick={() => { addItem(chosen.sku, 1, { name: fam.name, variant: chosen.variant ?? "", unitPrice: chosen.unitPrice }); notify(t.added.replace("%s", `${fam.name} · ${chosen.variant ?? ""}`)); }} style={{ marginTop: 16, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 14, borderRadius: 14, background: "var(--orange)", color: "#fff", fontWeight: 800, fontSize: 15, border: "none", boxShadow: "0 4px 0 rgba(0,0,0,0.12)", cursor: "pointer" }}>
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
  const [menu, setMenu] = useState<FamilyGroup[] | null>(null);
  useEffect(() => {
    fetch("/api/menu").then((r) => r.json()).then((d) => setMenu(d.menu ?? [])).catch(() => setMenu([]));
  }, []);

  return (
    <section id="menu" data-r="menu-sec" style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 44px 104px", scrollMarginTop: 72 }}>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 52px" }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange)" }}>{t.menuKicker}</div>
        <h2 className="font-display" data-rh2="" style={{ fontWeight: 700, fontSize: 52, lineHeight: 1.04, margin: "14px 0 0", color: "var(--ink)" }}>{t.menuTitle}</h2>
        <p style={{ fontSize: 18, color: "var(--soft)", margin: "16px 0 0" }}>{t.menuSub}</p>
      </div>
      {menu === null ? (
        <div style={{ textAlign: "center", color: "var(--soft)", padding: 30 }}>Loading menu…</div>
      ) : (
        <div data-r="menu-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 26 }}>
          {menu.map((fam) => <MenuCard key={fam.family} fam={fam} />)}
        </div>
      )}
    </section>
  );
}
