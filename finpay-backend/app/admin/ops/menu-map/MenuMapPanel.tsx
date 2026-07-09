"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MenuMapRow, PricingProductRow } from "@/lib/opsStore";

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 9, border: "1.5px solid var(--line)", fontSize: 13.5, background: "#fff", color: "var(--ink)",
};
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 14 };

function MenuRow({ row, products }: { row: MenuMapRow; products: PricingProductRow[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(row.productId ?? "");
  const [qty, setQty] = useState(String(row.qtyPer ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (row.productId ?? "") !== productId || (row.productId && String(row.qtyPer) !== qty);

  const save = async () => {
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/menu-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuSku: row.menuSku, productId: productId || null, qtyPer: Number(qty) || 1 }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not save.");
      else router.refresh();
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>
          {row.menuName}{row.menuVariant ? <span style={{ color: "var(--soft)", fontWeight: 600 }}> · {row.menuVariant}</span> : ""}
          <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12 }}> · {row.menuSku}</span>
          {!row.available && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "var(--soft)" }}>SOON</span>}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: row.productId ? "var(--green)" : "var(--orange)" }}>{row.productId ? "linked" : "unlinked"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--soft)", fontWeight: 700 }}>→ product</span>
        <select style={{ ...inputStyle, flex: "1 1 180px", minWidth: 160 }} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">— not linked —</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
        </select>
        {productId && (
          <>
            <span style={{ fontSize: 12, color: "var(--soft)", fontWeight: 700 }}>× qty</span>
            <input type="number" inputMode="decimal" min="0" step="0.1" style={{ ...inputStyle, width: 72 }} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="qty per" />
          </>
        )}
        <button
          onClick={save}
          disabled={busy || !dirty}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13, cursor: busy || !dirty ? "default" : "pointer", background: !dirty ? "var(--line)" : "var(--choco)", color: !dirty ? "var(--soft)" : "#fff" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

export default function MenuMapPanel({ rows, products }: { rows: MenuMapRow[]; products: PricingProductRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: "var(--soft)" }}>
        Link each storefront menu item to the ops product it draws from, with a quantity multiplier (e.g. a 100g item might draw 2× a 40g one). Website orders will draw down stock and book COGS through these links.
      </div>
      {rows.map((r) => <MenuRow key={r.menuSku} row={r} products={products} />)}
    </div>
  );
}
