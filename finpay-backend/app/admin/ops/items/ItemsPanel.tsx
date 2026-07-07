"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemDetailRow } from "@/lib/opsStore";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1.5px solid var(--line)", fontSize: 14, background: "#fff", color: "var(--ink)" };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--soft)", marginBottom: 3, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };

async function post(body: unknown) {
  const res = await fetch("/api/admin/ops/item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().then((d) => ({ ok: res.ok, d }));
}

// ---------------------------------------------------------------- One item row
function ItemRow({ item }: { item: ItemDetailRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [reorder, setReorder] = useState(item.reorderPoint == null ? "" : String(item.reorderPoint));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { ok } = await post({ action: "update", id: item.id, name, unit, reorderPoint: reorder === "" ? null : Number(reorder) });
    setBusy(false);
    if (ok) { setEditing(false); router.refresh(); }
  };
  const del = async () => {
    if (!confirm(`Remove ${item.name}?`)) return;
    setBusy(true);
    await post({ action: "delete", id: item.id });
    setBusy(false);
    router.refresh();
  };

  const low = item.reorderPoint != null && item.onHand < item.reorderPoint;

  if (editing) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.8fr auto", gap: 8, alignItems: "end", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
        <div><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label style={labelStyle}>Unit</label><input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
        <div><label style={labelStyle}>Reorder pt</label><input type="number" min="0" style={inputStyle} value={reorder} onChange={(e) => setReorder(e.target.value)} /></div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={save} disabled={busy} style={{ padding: "8px 12px", borderRadius: 9, border: "none", background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid var(--line)", background: "#fff", color: "var(--soft)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{item.name}</span>
        {low && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, color: "var(--red)" }}>LOW</span>}
        <div style={{ fontSize: 12, color: "var(--soft)" }}>
          {qtyFmt(item.onHand)} {item.unit} on hand · avg {rupiah(item.avgCost)}{item.reorderPoint != null ? ` · reorder ${qtyFmt(item.reorderPoint)}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => setEditing(true)} style={{ padding: "6px 11px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Edit</button>
        <button onClick={del} disabled={busy} style={{ padding: "6px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>🗑</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Add item
function AddItem({ type }: { type: "ingredient" | "packaging" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(type === "packaging" ? "pcs" : "g");
  const [reorder, setReorder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    if (!unit.trim()) return setError("Enter a unit.");
    setBusy(true);
    const { ok, d } = await post({ name, type, unit, reorderPoint: reorder === "" ? null : Number(reorder) });
    setBusy(false);
    if (!ok) setError(d.error ?? "Save failed.");
    else { setName(""); setReorder(""); setOpen(false); router.refresh(); }
  };

  if (!open) return <button onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 999, border: "1.5px dashed var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", marginTop: 8 }}>+ Add {type === "packaging" ? "packaging" : "goods"}</button>;

  return (
    <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)", display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.8fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
      <div><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div><label style={labelStyle}>Unit</label><input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g/ml/pcs" /></div>
      <div><label style={labelStyle}>Reorder pt</label><input type="number" min="0" style={inputStyle} value={reorder} onChange={(e) => setReorder(e.target.value)} placeholder="opt" /></div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={add} disabled={busy} style={{ padding: "8px 12px", borderRadius: 9, border: "none", background: "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{busy ? "…" : "Add"}</button>
        <button onClick={() => setOpen(false)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid var(--line)", background: "#fff", color: "var(--soft)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>✕</button>
      </div>
      {error && <div style={{ gridColumn: "1 / -1", color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Packaging out
function PackagingOut({ packaging }: { packaging: ItemDetailRow[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!itemId) return setError("Select a packaging item.");
    if (qty === "" || Number(qty) <= 0) return setError("Enter a quantity.");
    setBusy(true);
    const res = await fetch("/api/admin/ops/packaging-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, qty: Number(qty), note: note || null }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) setError(d.error ?? "Failed.");
    else { setDone(`Logged out · ${typeof d.cost === "number" ? rupiah(d.cost) : ""}`); setItemId(""); setQty(""); setNote(""); router.refresh(); }
  };

  return (
    <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--choco)" }}>Packaging out (bundle packing)</div>
      {done && <div style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 700 }}>✓ {done}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr", gap: 8 }}>
        <select style={inputStyle} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">— packaging item —</option>
          {packaging.map((p) => <option key={p.id} value={p.id}>{p.name} ({qtyFmt(p.onHand)} {p.unit})</option>)}
        </select>
        <input type="number" min="0" inputMode="decimal" style={inputStyle} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" />
      </div>
      <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="note / bundle ref (optional)" />
      {error && <div style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
      <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "9px 16px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{busy ? "Logging…" : "Log packaging out"}</button>
    </div>
  );
}

export default function ItemsPanel({ items }: { items: ItemDetailRow[] }) {
  const goods = items.filter((i) => i.type === "ingredient");
  const packaging = items.filter((i) => i.type === "packaging");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)", marginBottom: 6 }}>Goods (ingredients) · {goods.length}</div>
        {goods.map((i) => <ItemRow key={i.id} item={i} />)}
        <AddItem type="ingredient" />
      </div>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>Packaging · {packaging.length}</div>
        <div>{packaging.map((i) => <ItemRow key={i.id} item={i} />)}</div>
        <AddItem type="packaging" />
        {packaging.length > 0 && <PackagingOut packaging={packaging} />}
      </div>
    </div>
  );
}
