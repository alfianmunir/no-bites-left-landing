"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductRecipeRow, RecipeLineRow, ItemDetailRow } from "@/lib/opsStore";

function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--line)", fontSize: 13.5, background: "#fff", color: "var(--ink)" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };

async function post(body: unknown) {
  const res = await fetch("/api/admin/ops/recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().then((d) => ({ ok: res.ok, d }));
}

// ---------------------------------------------------------------- One BOM line
function Line({ line }: { line: RecipeLineRow }) {
  const router = useRouter();
  const [qty, setQty] = useState(String(line.qtyPerBatch));
  const [busy, setBusy] = useState(false);
  const dirty = Number(qty) !== line.qtyPerBatch;

  const save = async () => {
    setBusy(true);
    const { ok } = await post({ action: "updateLine", lineId: line.id, qty: Number(qty) });
    setBusy(false);
    if (ok) router.refresh();
  };
  const del = async () => {
    setBusy(true);
    await post({ action: "deleteLine", lineId: line.id });
    setBusy(false);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{line.name}</span>
      <input type="number" min="0" style={{ ...inputStyle, width: 84 }} value={qty} onChange={(e) => setQty(e.target.value)} />
      <span style={{ fontSize: 12, color: "var(--soft)", width: 28 }}>{line.unit}</span>
      {dirty && <button onClick={save} disabled={busy} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>}
      <button onClick={del} disabled={busy} aria-label="delete line" style={{ border: "none", background: "transparent", color: "var(--red)", fontSize: 15, cursor: "pointer" }}>🗑</button>
    </div>
  );
}

// ---------------------------------------------------------------- Add line
function AddLine({ recipeId, items }: { recipeId: string; items: ItemDetailRow[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!itemId || !qty || Number(qty) <= 0) return;
    setBusy(true);
    const { ok } = await post({ action: "addLine", recipeId, itemId, qty: Number(qty) });
    setBusy(false);
    if (ok) { setItemId(""); setQty(""); router.refresh(); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
      <select style={{ ...inputStyle, flex: 1 }} value={itemId} onChange={(e) => setItemId(e.target.value)}>
        <option value="">+ add item…</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
      </select>
      <input type="number" min="0" style={{ ...inputStyle, width: 84 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" />
      <button onClick={add} disabled={busy || !itemId} style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Add</button>
    </div>
  );
}

// ---------------------------------------------------------------- Recipe card
function RecipeCard({ pr, items }: { pr: ProductRecipeRow; items: ItemDetailRow[] }) {
  const router = useRouter();
  const [yieldQty, setYieldQty] = useState(pr.batchYieldQty == null ? "" : String(pr.batchYieldQty));
  const [busy, setBusy] = useState(false);
  const goods = items.filter((i) => i.type === "ingredient");
  const packaging = items.filter((i) => i.type === "packaging");
  const ingredientLines = pr.lines.filter((l) => l.type === "ingredient");
  const packagingLines = pr.lines.filter((l) => l.type === "packaging");
  const yieldDirty = pr.recipeId != null && Number(yieldQty) !== pr.batchYieldQty;

  const createRecipe = async () => {
    if (!yieldQty || Number(yieldQty) <= 0) return;
    setBusy(true);
    await post({ action: "createRecipe", productId: pr.productId, batchYieldQty: Number(yieldQty) });
    setBusy(false);
    router.refresh();
  };
  const saveYield = async () => {
    setBusy(true);
    await post({ action: "updateYield", recipeId: pr.recipeId, batchYieldQty: Number(yieldQty) });
    setBusy(false);
    router.refresh();
  };
  const removeRecipe = async () => {
    if (!confirm(`Remove recipe for ${pr.name}?${pr.hasBatches ? " It has batch history, so it will be deactivated (kept for cost history)." : ""}`)) return;
    setBusy(true);
    await post({ action: "deleteRecipe", recipeId: pr.recipeId });
    setBusy(false);
    router.refresh();
  };

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 15 }}>{pr.name} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12.5 }}>{pr.sku}</span></div>
        {pr.recipeId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--soft)", fontWeight: 700 }}>yields</span>
            <input type="number" min="0" style={{ ...inputStyle, width: 70 }} value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
            {yieldDirty && <button onClick={saveYield} disabled={busy} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>}
            <button onClick={removeRecipe} disabled={busy} style={{ padding: "6px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Remove</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" min="0" style={{ ...inputStyle, width: 80 }} value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="yield" />
            <button onClick={createRecipe} disabled={busy || !yieldQty} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Create recipe</button>
          </div>
        )}
      </div>

      {pr.recipeId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.04em", marginBottom: 4 }}>INGREDIENTS · {ingredientLines.length}</div>
            {ingredientLines.map((l) => <Line key={l.id} line={l} />)}
            <AddLine recipeId={pr.recipeId} items={goods} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.04em", marginBottom: 4 }}>PACKAGING · {packagingLines.length}</div>
            {packagingLines.map((l) => <Line key={l.id} line={l} />)}
            <AddLine recipeId={pr.recipeId} items={packaging} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecipesPanel({ recipes, items }: { recipes: ProductRecipeRow[]; items: ItemDetailRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {recipes.map((pr) => <RecipeCard key={pr.productId} pr={pr} items={items} />)}
    </div>
  );
}
