"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeEconomics, agingBucket, formatPct, type AgingBucket } from "@/lib/opsOrderMath";
import type { ChannelRow, PricingProductRow, SalesOrderRow, InvoiceRow, PrepItemRow } from "@/lib/opsStore";

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
const sectionLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 };

interface LineDraft {
  key: number;
  productId: string;
  qty: string;
  unitPrice: string;
}
let nextKey = 1;
const blankLine = (): LineDraft => ({ key: nextKey++, productId: "", qty: "1", unitPrice: "" });

const BUCKET_COLOR: Record<AgingBucket, string> = {
  paid: "var(--green)", current: "var(--soft)", "1-30": "var(--orange)", "31-60": "var(--orange)", "60+": "var(--red)",
};

// Kitchen fulfillment lifecycle.
const STAGES = [
  { key: "preparing", label: "Preparing", color: "var(--orange)" },
  { key: "packed", label: "Packed", color: "var(--blue)" },
  { key: "in_delivery", label: "In delivery", color: "var(--choco)" },
  { key: "delivered", label: "Delivered", color: "var(--green)" },
] as const;
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const STAGE_COLOR: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.color]));

function itemsSummary(items: { name: string; qty: number }[]): string {
  return items.map((i) => `${qtyFmt(i.qty)}× ${i.name}`).join(" · ");
}

// ---------------------------------------------------------------- Quick entry
function OrderEntry({ channels, products }: { channels: ChannelRow[]; products: PricingProductRow[] }) {
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
function PrepList({ prep }: { prep: PrepItemRow[] }) {
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

// ---------------------------------------------------------------- Order card
function OrderCard({ order, checked, onToggle }: { order: SalesOrderRow; checked: boolean; onToggle: (id: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fee = order.gross > 0 ? order.gross * order.feePct + order.feeFlat : 0;
  const net = order.gross - fee - order.cogs;
  const margin = order.gross > 0 ? net / order.gross : 0;
  const isB2B = order.channel === "b2b";
  const paid = order.paymentStatus === "paid";

  const patch = async (body: { fulfillmentStatus?: string; paymentStatus?: string }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/order/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, ...body }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8, borderColor: checked ? "var(--choco)" : "var(--line)", background: checked ? "var(--surface2)" : "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={checked} onChange={() => onToggle(order.id)} style={{ width: 17, height: 17, accentColor: "var(--choco)", cursor: "pointer" }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>
            {order.customerRef || "—"}
            <span style={{ color: "var(--soft)", fontWeight: 700, fontSize: 12.5 }}> · {order.channel}</span>
          </span>
        </label>
        <div style={{ fontSize: 12, color: "var(--soft)" }}>{order.orderedAt.slice(0, 10)}</div>
      </div>

      {order.items.length > 0 && (
        <div style={{ fontSize: 13, color: "var(--ink)" }}>{itemsSummary(order.items)}</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12.5, color: "var(--soft)" }}>
        <span>Gross <strong style={{ color: "var(--ink)" }}>{rupiah(order.gross)}</strong></span>
        <span>Net <strong style={{ color: "var(--ink)" }}>{rupiah(net)}</strong></span>
        <span>Margin <strong style={{ color: margin < 0.3 ? "var(--red)" : "var(--green)" }}>{formatPct(margin)}</strong></span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        {/* Fulfillment */}
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: STAGE_COLOR[order.fulfillmentStatus] ?? "var(--soft)", flexShrink: 0 }} />
        <select
          value={order.fulfillmentStatus}
          disabled={busy}
          onChange={(e) => patch({ fulfillmentStatus: e.target.value })}
          style={{ padding: "6px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--ink)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
        >
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <span style={{ flex: 1 }} />

        {/* Payment */}
        {isB2B ? (
          <span style={{ fontSize: 12, fontWeight: 800, color: order.invoiceStatus === "paid" ? "var(--green)" : "var(--orange)" }}>
            invoice: {order.invoiceStatus ?? "—"}
          </span>
        ) : (
          <>
            <span style={{ fontSize: 12, fontWeight: 800, color: paid ? "var(--green)" : "var(--orange)" }}>{paid ? "Paid" : "Unpaid"}</span>
            <button
              onClick={() => patch({ paymentStatus: paid ? "unpaid" : "paid" })}
              disabled={busy}
              style={{ padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${paid ? "var(--line)" : "var(--green)"}`, background: "#fff", color: paid ? "var(--soft)" : "var(--green)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
            >
              {paid ? "Mark unpaid" : "Mark paid"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Invoice row
function InvoiceItem({ inv, today }: { inv: InvoiceRow; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const bucket = agingBucket(inv.status, inv.dueDate, today);
  const mark = async (status: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id, status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
      <div style={{ fontSize: 13 }}>
        <span style={{ fontWeight: 800 }}>{inv.customerRef || "—"}</span>
        <span style={{ color: "var(--soft)" }}> · {inv.number ?? inv.salesOrderId.slice(0, 6)} · due {inv.dueDate ?? "—"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>{rupiah(inv.amount)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: BUCKET_COLOR[bucket] }}>
          {inv.status === "paid" ? "paid" : bucket === "current" ? "current" : `${bucket}d overdue`}
        </span>
        {inv.status !== "paid" && (
          <button onClick={() => mark("paid")} disabled={busy} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--green)", background: "#fff", color: "var(--green)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Mark paid</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Panel
export default function OrdersPanel({
  channels,
  products,
  orders,
  invoices,
  prep,
  today,
}: {
  channels: ChannelRow[];
  products: PricingProductRow[];
  orders: SalesOrderRow[];
  invoices: InvoiceRow[];
  prep: PrepItemRow[];
  today: string;
}) {
  const router = useRouter();
  const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const outstandingTotal = outstanding.reduce((s, i) => s + i.amount, 0);

  // Group orders by order date (already sorted newest-first from the server).
  const groups = useMemo(() => {
    const m = new Map<string, SalesOrderRow[]>();
    for (const o of orders) {
      const d = o.orderedAt.slice(0, 10);
      const list = m.get(d);
      if (list) list.push(o);
      else m.set(d, [o]);
    }
    return [...m.entries()];
  }, [orders]);

  // Bulk selection + apply.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFulfillment, setBulkFulfillment] = useState("");
  const [bulkPayment, setBulkPayment] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleGroup = (ids: string[], allOn: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) allOn ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSel = () => setSelected(new Set());

  const applyBulk = async () => {
    if (selected.size === 0 || (!bulkFulfillment && !bulkPayment)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/order/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [...selected],
          fulfillmentStatus: bulkFulfillment || undefined,
          paymentStatus: bulkPayment || undefined,
        }),
      });
      if (res.ok) {
        clearSel();
        setBulkFulfillment("");
        setBulkPayment("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: selected.size > 0 ? 84 : 0 }}>
      <OrderEntry channels={channels} products={products} />

      <PrepList prep={prep} />

      {invoices.length > 0 && (
        <div>
          <div style={sectionLabel}>B2B INVOICES (AR) · {outstanding.length} open · {rupiah(outstandingTotal)}</div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {invoices.map((inv) => (
              <InvoiceItem key={inv.id} inv={inv} today={today} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={sectionLabel}>RECENT ORDERS · {orders.length}</div>
        {orders.length === 0 ? (
          <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No orders recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groups.map(([date, list]) => {
              const ids = list.map((o) => o.id);
              const allOn = ids.every((id) => selected.has(id));
              const someOn = ids.some((id) => selected.has(id));
              return (
                <div key={date}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--choco)" }}>{date} <span style={{ color: "var(--soft)", fontWeight: 700 }}>· {list.length}</span></div>
                    <button
                      onClick={() => toggleGroup(ids, allOn)}
                      style={{ padding: "4px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: someOn ? "var(--surface2)" : "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}
                    >
                      {allOn ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {list.map((o) => <OrderCard key={o.id} order={o} checked={selected.has(o.id)} onToggle={toggle} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 12, zIndex: 30 }}>
          <div style={{ ...card, padding: 12, boxShadow: "0 6px 20px rgba(40,26,11,0.18)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: "var(--choco)" }}>{selected.size} selected</span>
            <select value={bulkFulfillment} onChange={(e) => setBulkFulfillment(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", fontSize: 12.5, fontWeight: 800, color: "var(--ink)", cursor: "pointer" }}>
              <option value="">Set stage…</option>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={bulkPayment} onChange={(e) => setBulkPayment(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", fontSize: 12.5, fontWeight: 800, color: "var(--ink)", cursor: "pointer" }}>
              <option value="">Set payment…</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            <span style={{ flex: 1 }} />
            <button onClick={clearSel} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Clear</button>
            <button
              onClick={applyBulk}
              disabled={busy || (!bulkFulfillment && !bulkPayment)}
              style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: busy || (!bulkFulfillment && !bulkPayment) ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: busy || (!bulkFulfillment && !bulkPayment) ? "default" : "pointer" }}
            >
              {busy ? "Applying…" : `Apply to ${selected.size}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
