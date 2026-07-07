"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StockBalanceRow } from "@/lib/opsStore";

function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };

export default function OpnameForm({ balance }: { balance: StockBalanceRow[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; variance: number } | null>(null);

  const selected = balance.find((b) => b.itemId === itemId) ?? null;
  const preview = selected && counted !== "" ? Number(counted) - selected.qtyOnHand : null;

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!itemId) {
      setError("Select an item.");
      return;
    }
    if (counted === "" || !Number.isFinite(Number(counted)) || Number(counted) < 0) {
      setError("Enter the counted quantity.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/opname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, countedQty: Number(counted), note: note || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Opname failed.");
      } else {
        setDone({ name: selected?.name ?? "item", variance: Number(data.variance) });
        setItemId("");
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
            : `Variance of ${done.variance > 0 ? "+" : ""}${qtyFmt(done.variance)} posted as an adjustment.`}
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Item</label>
          <select style={inputStyle} value={itemId} onChange={(e) => { setItemId(e.target.value); setDone(null); }}>
            <option value="">— select item —</option>
            {balance.map((b) => (
              <option key={b.itemId} value={b.itemId}>{b.name} — system {qtyFmt(b.qtyOnHand)} {b.unit}</option>
            ))}
          </select>
        </div>

        {selected && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--soft)" }}>
            <span>System on hand: <strong style={{ color: "var(--ink)" }}>{qtyFmt(selected.qtyOnHand)} {selected.unit}</strong></span>
          </div>
        )}

        <div>
          <label style={labelStyle}>Counted quantity{selected ? ` (${selected.unit})` : ""}</label>
          <input type="number" inputMode="decimal" min="0" style={inputStyle} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="physical count" />
        </div>

        {preview != null && (
          <div style={{ fontSize: 13.5, fontWeight: 700, color: preview === 0 ? "var(--green)" : preview > 0 ? "var(--choco)" : "var(--red)" }}>
            Variance: {preview > 0 ? "+" : ""}{qtyFmt(preview)} {selected?.unit}
            {preview !== 0 && <span style={{ color: "var(--soft)", fontWeight: 400 }}> ({preview > 0 ? "count higher than system" : "count lower than system"})</span>}
          </div>
        )}

        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. monthly count, spillage found" />
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Posting…" : "Post count"}
        </button>
      </div>
    </div>
  );
}
