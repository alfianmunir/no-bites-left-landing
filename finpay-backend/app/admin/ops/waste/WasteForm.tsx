"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemRow, ProductRow } from "@/lib/opsStore";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };

type Kind = "item" | "product";

export default function WasteForm({ items, products }: { items: ItemRow[]; products: ProductRow[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("item");
  const [refId, setRefId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; cost?: number } | null>(null);

  const item = items.find((i) => i.id === refId);
  const product = products.find((p) => p.id === refId);
  const estCost = kind === "item" ? (item ? item.avgCost * (Number(qty) || 0) : null) : (product ? product.stdCost * (Number(qty) || 0) : null);

  const switchKind = (k: Kind) => { setKind(k); setRefId(""); setDone(null); setError(null); };

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!refId) { setError(kind === "item" ? "Select an item." : "Select a product."); return; }
    if (qty === "" || !Number.isFinite(Number(qty)) || Number(qty) <= 0) { setError("Enter a quantity greater than 0."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "item"
            ? { kind: "item", itemId: refId, qty: Number(qty), note: note || null }
            : { kind: "product", productId: refId, qty: Number(qty), note: note || null },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Waste entry failed.");
      } else {
        setDone({ label: kind === "item" ? (item?.name ?? "item") : (product?.name ?? "product"), cost: typeof data.cost === "number" ? data.cost : undefined });
        setRefId("");
        setQty("");
        setNote("");
        router.refresh();
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {done && (
        <div style={{ padding: "14px 16px", background: "var(--tint-success)", border: "1.5px solid var(--green)", borderRadius: 14, fontSize: 13.5, color: "var(--ink)" }}>
          Waste recorded for <strong>{done.label}</strong>
          {done.cost != null && <> · cost written off <strong>{rupiah(done.cost)}</strong></>}. ✓
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["item", "product"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                border: `1.5px solid ${kind === k ? "var(--choco)" : "var(--line)"}`,
                background: kind === k ? "var(--choco)" : "#fff",
                color: kind === k ? "#fff" : "var(--soft)",
              }}
            >
              {k === "item" ? "Ingredient / packaging" : "Finished product"}
            </button>
          ))}
        </div>

        <div>
          <label style={labelStyle}>{kind === "item" ? "Item" : "Product"}</label>
          <select style={inputStyle} value={refId} onChange={(e) => { setRefId(e.target.value); setDone(null); }}>
            <option value="">— select —</option>
            {kind === "item"
              ? items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)
              : products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Quantity wasted{kind === "item" && item ? ` (${item.unit})` : ""}</label>
          <input type="number" inputMode="decimal" min="0" style={inputStyle} value={qty} onChange={(e) => setQty(e.target.value)} />
          {estCost != null && (Number(qty) || 0) > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 6 }}>
              Est. cost written off {rupiah(estCost)} <span style={{ opacity: 0.7 }}>({kind === "item" ? "avg" : "std"} cost × qty)</span>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. failed bake, expired, dropped" />
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--red)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Recording…" : "Record waste"}
        </button>
      </div>
    </div>
  );
}
