"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeEconomics, formatPct } from "@/lib/opsOrderMath";
import type { ChannelRow, PricingProductRow, PrepItemRow } from "@/lib/opsStore";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };

interface LineDraft {
  key: number;
  productId: string;
  qty: string;
  unitPrice: string;
}
let nextKey = 1;
const blankLine = (): LineDraft => ({ key: nextKey++, productId: "", qty: "1", unitPrice: "" });

// ---------------------------------------------------------------- Quick entry
export function OrderEntry({ channels, products }: { channels: ChannelRow[]; products: PricingProductRow[] }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [customerRef, setCustomerRef] = useState("");
  const [orderedAt, setOrderedAt] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const channel = channels.find((c) => c.id === channelId);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const removeLine = (key: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)));

  const pickProduct = (key: number, productId: string) => {
    const p = productById.get(productId);
    setLine(key, { productId, unitPrice: p ? String(Math.round(p.listPrice)) : "" });
  };

  const econLines = lines
    .filter((l) => l.productId && Number(l.qty) > 0)
    .map((l) => ({ qty: Number(l.qty), unitPrice: Number(l.unitPrice) || 0, unitCogs: productById.get(l.productId)?.stdCost ?? 0 }));
  const econ = computeEconomics(econLines, channel?.feePct ?? 0, channel?.feeFlat ?? 0);
  const isB2B = channel?.name === "b2b";
  const isCanteen = channel?.name === "canteen";

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!channelId) return setError("Select a channel.");
    if (econLines.length === 0) return setError("Add at least one product line.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          customerRef: customerRef || null,
          orderedAt: orderedAt || null,
          lines: lines.filter((l) => l.productId && Number(l.qty) > 0).map((l) => ({ productId: l.productId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not record the order.");
      else {
        setDone(isB2B ? "Order recorded + invoice raised." : isCanteen ? "Canteen order recorded — paid & delivered." : "Order recorded.");
        setLines([blankLine()]);
        setCustomerRef("");
        router.refresh();
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>New order</div>

      {done && (
        <div style={{ padding: "10px 14px", background: "var(--tint-success)", border: "1.5px solid var(--green)", borderRadius: 12, fontSize: 13.5, color: "var(--ink)", fontWeight: 700 }}>✓ {done}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Channel</label>
          <select style={inputStyle} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.feePct > 0 ? ` · ${(c.feePct * 100).toFixed(0)}%` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>{isB2B ? "Partner / cafe" : "Customer"}</label>
          <input style={inputStyle} value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="name / ref" />
        </div>
        <div>
          <label style={labelStyle}>Order date</label>
          <input type="date" style={inputStyle} value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
        </div>
      </div>

      {isCanteen && (
        <div style={{ fontSize: 12, color: "var(--soft)", fontWeight: 600, marginTop: -4 }}>Canteen orders are recorded as <strong>paid</strong> and <strong>delivered</strong> right away.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={labelStyle}>Items</label>
        {lines.map((l) => {
          const p = productById.get(l.productId);
          return (
            <div key={l.key} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.9fr auto", gap: 8, alignItems: "center" }}>
              <select style={inputStyle} value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)}>
                <option value="">— product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="qty" />
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} placeholder={p ? String(Math.round(p.listPrice)) : "price"} aria-label="unit price" />
              {lines.length > 1 ? (
                <button onClick={() => removeLine(l.key)} aria-label="remove" style={{ border: "none", background: "transparent", color: "var(--red)", fontSize: 17, cursor: "pointer" }}>🗑</button>
              ) : <span style={{ width: 17 }} />}
            </div>
          );
        })}
        <button onClick={addLine} style={{ alignSelf: "flex-start", padding: "7px 13px", borderRadius: 999, border: "1.5px dashed var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>+ Add item</button>
      </div>

      {/* Live economics */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 13, color: "var(--soft)", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <span>Gross <strong style={{ color: "var(--ink)" }}>{rupiah(econ.gross)}</strong></span>
        {econ.fee > 0 && <span>Fee <strong style={{ color: "var(--red)" }}>−{rupiah(econ.fee)}</strong></span>}
        <span>COGS <strong style={{ color: "var(--ink)" }}>{rupiah(econ.cogs)}</strong></span>
        <span>Net <strong style={{ color: "var(--ink)" }}>{rupiah(econ.net)}</strong></span>
        <span>Margin <strong style={{ color: econ.marginPct < 0.3 && econ.gross > 0 ? "var(--red)" : "var(--green)" }}>{formatPct(econ.marginPct)}</strong></span>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Saving…" : isB2B ? "Record order + invoice" : "Record order"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Prep list
export function PrepList({ prep }: { prep: PrepItemRow[] }) {
  const totalUnits = prep.reduce((s, p) => s + p.qty, 0);
  return (
    <div style={{ ...card, borderColor: "var(--orange)", background: "var(--tint-amber)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>🧑‍🍳 To prepare</div>
        <div style={{ fontSize: 12, color: "var(--soft)", fontWeight: 700 }}>{qtyFmt(totalUnits)} units across preparing orders</div>
      </div>
      {prep.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--soft)" }}>Nothing in preparing — all caught up. 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {prep.map((p) => (
            <div key={p.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fff", borderRadius: 10, border: "1.5px solid var(--line)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{p.name} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12 }}>· {p.sku}</span></div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: "var(--choco)" }}>{qtyFmt(p.qty)}</span>
                <span style={{ fontSize: 11.5, color: "var(--soft)", fontWeight: 700 }}>· {p.orders} order{p.orders > 1 ? "s" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
