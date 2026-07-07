"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemRow, SupplierRow, ReceiveResultLine } from "@/lib/opsStore";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

interface LineDraft {
  key: number;
  itemId: string;
  qty: string;
  unitCost: string;
  expiryDate: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };

let nextKey = 1;
function blankLine(): LineDraft {
  return { key: nextKey++, itemId: "", qty: "", unitCost: "", expiryDate: "" };
}

export default function ReceiveForm({ items, suppliers }: { items: ItemRow[]; suppliers: SupplierRow[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [orderedAt, setOrderedAt] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiveResultLine[] | null>(null);

  const itemById = new Map(items.map((i) => [i.id, i]));

  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const removeLine = (key: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)));

  const filled = lines.filter((l) => l.itemId && l.qty);
  const total = filled.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  const submit = async () => {
    setError(null);
    if (filled.length === 0) {
      setError("Add at least one line with an item and quantity.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId || null,
          supplierName: supplierId ? null : newSupplier || null,
          invoiceRef: invoiceRef || null,
          orderedAt: orderedAt || null,
          lines: filled.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), unitCost: Number(l.unitCost), expiryDate: l.expiryDate || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Receive failed.");
      } else {
        setResult(data.lines as ReceiveResultLine[]);
        // reset the form for the next receipt
        setLines([blankLine()]);
        setInvoiceRef("");
        setNewSupplier("");
        router.refresh(); // refresh stock numbers behind the scenes
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {result && (
        <div style={{ padding: "14px 16px", background: "var(--tint-success)", border: "1.5px solid var(--green)", borderRadius: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "var(--green)", marginBottom: 8 }}>✓ Received — stock updated</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {result.map((l) => {
              const changed = l.newAvgCost !== l.oldAvgCost;
              return (
                <div key={l.itemId} style={{ fontSize: 13, color: "var(--ink)" }}>
                  <strong>{l.name}</strong> +{l.qty} @ {rupiah(l.unitCost)}
                  {changed ? (
                    <span style={{ color: "var(--soft)" }}> · avg cost {rupiah(l.oldAvgCost)} → <strong style={{ color: "var(--choco)" }}>{rupiah(l.newAvgCost)}</strong></span>
                  ) : (
                    <span style={{ color: "var(--soft)" }}> · avg cost {rupiah(l.newAvgCost)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Supplier</label>
            <select style={inputStyle} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{suppliers.length ? "— pick or add new —" : "— add new below —"}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!supplierId && (
              <input style={{ ...inputStyle, marginTop: 8 }} placeholder="New supplier name (optional)" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
            )}
          </div>
          <div>
            <label style={labelStyle}>Ordered date</label>
            <input type="date" style={inputStyle} value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
            <label style={{ ...labelStyle, marginTop: 8 }}>Invoice ref</label>
            <input style={inputStyle} placeholder="optional" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={labelStyle}>Lines</label>
          {lines.map((l) => {
            const item = itemById.get(l.itemId);
            return (
              <div key={l.key} style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select style={{ ...inputStyle, flex: 1 }} value={l.itemId} onChange={(e) => setLine(l.key, { itemId: e.target.value })}>
                    <option value="">— select item —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(l.key)} aria-label="remove line" style={{ border: "none", background: "transparent", color: "var(--red)", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>🗑</button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Qty{item ? ` (${item.unit})` : ""}</label>
                    <input type="number" inputMode="decimal" min="0" style={inputStyle} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Unit cost</label>
                    <input type="number" inputMode="decimal" min="0" style={inputStyle} value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })} placeholder={item ? String(Math.round(item.avgCost)) : ""} />
                  </div>
                  <div>
                    <label style={labelStyle}>Expiry (optional)</label>
                    <input type="date" style={inputStyle} value={l.expiryDate} onChange={(e) => setLine(l.key, { expiryDate: e.target.value })} />
                  </div>
                </div>
                {item && l.qty && (
                  <div style={{ fontSize: 12, color: "var(--soft)" }}>
                    Line total {rupiah((Number(l.qty) || 0) * (Number(l.unitCost) || 0))} · current avg {rupiah(item.avgCost)}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={addLine} style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 999, border: "1.5px dashed var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Add line</button>
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14 }}>
            <span style={{ color: "var(--soft)" }}>Purchase total </span>
            <strong style={{ fontSize: 16 }}>{rupiah(total)}</strong>
          </div>
          <button onClick={submit} disabled={busy} style={{ padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Receiving…" : "Receive stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
