"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductOpnameChoice } from "@/lib/opsStore";

function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };

export default function ProductOpnameForm({ products }: { products: ProductOpnameChoice[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; variance: number } | null>(null);

  const selected = products.find((p) => p.productId === productId) ?? null;
  const preview = selected && counted !== "" ? Number(counted) - selected.qtyOnHand : null;

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!productId) {
      setError("Select a product.");
      return;
    }
    if (counted === "" || !Number.isFinite(Number(counted)) || Number(counted) < 0) {
      setError("Enter the counted quantity.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/product-opname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, countedQty: Number(counted), note: note || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Opname failed.");
      } else {
        setDone({ name: selected?.name ?? "product", variance: Number(data.variance) });
        setProductId("");
        setCounted("");
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
        <div style={{ padding: "14px 16px", background: done.variance === 0 ? "var(--tint-success)" : "#fff3e2", border: `1.5px solid ${done.variance === 0 ? "var(--green)" : "var(--orange)"}`, borderRadius: 14, fontSize: 13.5, color: "var(--ink)" }}>
          <strong>{done.name}</strong> counted.{" "}
          {done.variance === 0
            ? "No variance — system matched the count. ✓"
            : `Variance of ${done.variance > 0 ? "+" : ""}${qtyFmt(done.variance)} pcs posted as an adjustment.`}
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Product (by SKU)</label>
          <select style={inputStyle} value={productId} onChange={(e) => { setProductId(e.target.value); setDone(null); }}>
            <option value="">— select product —</option>
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.sku ? `${p.sku} · ` : ""}{p.name}{p.variant ? ` (${p.variant})` : ""} — system {qtyFmt(p.qtyOnHand)} pcs
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--soft)" }}>
            <span>SKU: <strong style={{ color: "var(--ink)" }}>{selected.sku || "—"}</strong></span>
            <span>System on hand: <strong style={{ color: "var(--ink)" }}>{qtyFmt(selected.qtyOnHand)} pcs</strong></span>
          </div>
        )}

        <div>
          <label style={labelStyle}>Counted quantity (pcs)</label>
          <input type="number" inputMode="decimal" min="0" style={inputStyle} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="physical count" />
        </div>

        {preview != null && (
          <div style={{ fontSize: 13.5, fontWeight: 700, color: preview === 0 ? "var(--green)" : preview > 0 ? "var(--choco)" : "var(--red)" }}>
            Variance: {preview > 0 ? "+" : ""}{qtyFmt(preview)} pcs
            {preview !== 0 && <span style={{ color: "var(--soft)", fontWeight: 400 }}> ({preview > 0 ? "count higher than system" : "count lower than system"})</span>}
          </div>
        )}

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. end-of-day count, display tray" />
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Posting…" : "Post count"}
        </button>
      </div>
    </div>
  );
}
