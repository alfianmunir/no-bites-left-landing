"use client";

/**
 * AllOrdersList — the unified Order command center. Website (storefront) and
 * channel (manual: WA / direct / marketplace / B2B / canteen) orders render in
 * ONE date-grouped list, told apart by a type badge, with search + type +
 * payment filters and a SINGLE bulk bar whose one selection set fans out to the
 * right endpoint per type:
 *   • channel  → /api/admin/ops/order/bulk-status (any direction)
 *   • website  → /api/admin/orders/bulk-advance   (forward-only; server skips
 *                orders already at/past the target)
 * A website card opens the AdminOrderDetail modal (lifecycle + cancel/refund via
 * Finpay). B2B cards settle their invoice inline (order↔invoice stay in sync
 * server-side — see opsStore.setInvoiceStatus / applyOrderState).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeEconomics, agingBucket, formatPct, type AgingBucket } from "@/lib/opsOrderMath";
import type { SalesOrderRow, InvoiceRow, PricingProductRow } from "@/lib/opsStore";
import type { Order } from "@/lib/orders";
import AdminOrderDetail from "@/app/_components/AdminOrderDetail";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 };

// Website single-axis chain (forward only). label/color per stage.
const WEB = {
  PAID: { label: "Preparing", color: "var(--orange)", next: "BAKING" },
  BAKING: { label: "Packed", color: "var(--blue)", next: "READY_FOR_PICKUP" },
  READY_FOR_PICKUP: { label: "Ready for pickup", color: "var(--choco)", next: "PICKED_UP" },
  PICKED_UP: { label: "Picked up", color: "var(--green)", next: null },
} as const;
type WebStatus = keyof typeof WEB;
const WCHAIN: WebStatus[] = ["PAID", "BAKING", "READY_FOR_PICKUP", "PICKED_UP"];

// Channel fulfillment stages.
const CH_STAGE: Record<string, { label: string; color: string }> = {
  preparing: { label: "Preparing", color: "var(--orange)" },
  packed: { label: "Packed", color: "var(--blue)" },
  in_delivery: { label: "In delivery", color: "var(--choco)" },
  delivered: { label: "Delivered", color: "var(--green)" },
};
const CH_STAGES = Object.entries(CH_STAGE).map(([key, v]) => ({ key, ...v }));

// Bulk stage → per-type target (channel key `c`, website chain target `w`).
const STAGE_MAP: Record<string, { c: string | null; w: WebStatus | null }> = {
  preparing: { c: "preparing", w: null },
  packed: { c: "packed", w: "BAKING" },
  mid: { c: "in_delivery", w: "READY_FOR_PICKUP" },
  done: { c: "delivered", w: "PICKED_UP" },
};
const BULK_STAGE_OPTIONS = [
  { value: "preparing", label: "Preparing" },
  { value: "packed", label: "Packed / Baking" },
  { value: "mid", label: "In delivery / Ready for pickup" },
  { value: "done", label: "Delivered / Picked up" },
];

const BUCKET_COLOR: Record<AgingBucket, string> = {
  paid: "var(--green)", current: "var(--soft)", "1-30": "var(--orange)", "31-60": "var(--orange)", "60+": "var(--red)",
};

function itemsSummary(items: { name: string; qty: number }[]): string {
  return items.map((i) => `${qtyFmt(i.qty)}× ${i.name}`).join(" · ");
}

function dateLabel(dk: string, today: string, tomorrow: string): string {
  if (dk === today) return `Today · ${dk}`;
  if (dk === tomorrow) return `Tomorrow · ${dk}`;
  return dk;
}

// -------------------------------------------------------------- Unified row
interface UnifiedRow {
  key: string;
  id: string;
  dateKey: string;
  kind: "website" | "channel";
  title: string;
  badge: string;
  itemsLine: string;
  search: string;
  gross: number;
  fee: number;
  net: number;
  margin: number;
  hasFee: boolean;
  paid: boolean;
  // website
  order?: Order;
  webStatus?: WebStatus;
  overdue?: boolean;
  isNew?: boolean;
  // channel
  co?: SalesOrderRow;
  isB2B?: boolean;
}

export default function AllOrdersList({
  webOrders,
  channelOrders,
  invoices,
  expired,
  today,
  tomorrow,
  products,
  websiteFee,
}: {
  webOrders: Order[];
  channelOrders: SalesOrderRow[];
  invoices: InvoiceRow[];
  expired: Order[];
  today: string;
  tomorrow: string;
  products: PricingProductRow[];
  websiteFee: { pct: number; flat: number };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState<"all" | "website" | "channel">("all");
  const [fPaid, setFPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [bulkStage, setBulkStage] = useState("");
  const [bulkPay, setBulkPay] = useState("");
  const [busy, setBusy] = useState(false);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);

  const costBySku = useMemo(() => new Map(products.map((p) => [p.sku, p.stdCost])), [products]);

  // Normalize both order types into one row shape.
  const rows = useMemo<UnifiedRow[]>(() => {
    const out: UnifiedRow[] = [];
    for (const o of webOrders) {
      const status = (o.status in WEB ? o.status : "PAID") as WebStatus;
      const econ = computeEconomics(
        o.items.map((it) => ({ qty: it.qty, unitPrice: it.unit_price, unitCogs: costBySku.get(it.sku) ?? 0 })),
        websiteFee.pct,
        websiteFee.flat,
      );
      const name = `${o.customer.firstName} ${o.customer.lastName}`.trim();
      const itemsLine = itemsSummary(o.items);
      out.push({
        key: `w:${o.id}`, id: o.id, dateKey: o.pickup_date ?? o.created_at.slice(0, 10),
        kind: "website", title: `#${o.id} · ${name || "—"}`, badge: "website", itemsLine,
        search: `${o.id} ${name} ${itemsLine} website`.toLowerCase(),
        gross: econ.gross, fee: econ.fee, net: econ.net, margin: econ.marginPct, hasFee: websiteFee.pct > 0,
        paid: true, order: o, webStatus: status,
        overdue: !!o.pickup_date && o.pickup_date < today, isNew: status === "PAID",
      });
    }
    for (const co of channelOrders) {
      const fee = co.gross > 0 ? co.gross * co.feePct + co.feeFlat : 0;
      const net = co.gross - fee - co.cogs;
      const itemsLine = itemsSummary(co.items);
      out.push({
        key: `c:${co.id}`, id: co.id, dateKey: co.orderedAt.slice(0, 10),
        kind: "channel", title: co.customerRef || "—", badge: co.channel, itemsLine,
        search: `${co.customerRef ?? ""} ${itemsLine} ${co.channel}`.toLowerCase(),
        gross: co.gross, fee, net, margin: co.gross > 0 ? net / co.gross : 0, hasFee: co.feePct > 0,
        paid: co.paymentStatus === "paid", co, isB2B: co.channel === "b2b",
      });
    }
    return out;
  }, [webOrders, channelOrders, costBySku, websiteFee.pct, websiteFee.flat, today]);

  // Filters (client-side).
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (q && !r.search.includes(q)) return false;
    if (fType !== "all" && r.kind !== fType) return false;
    if (fPaid === "paid" && !r.paid) return false;
    if (fPaid === "unpaid" && (r.paid || r.kind === "website")) return false; // website always paid
    return true;
  });

  // Group by dateKey desc.
  const groups = useMemo(() => {
    const m = new Map<string, UnifiedRow[]>();
    for (const r of filtered) (m.get(r.dateKey) ?? m.set(r.dateKey, []).get(r.dateKey)!).push(r);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const toggleGroup = (keys: string[], allOn: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) allOn ? next.delete(k) : next.add(k);
      return next;
    });
  const clearSel = () => setSelected(new Set());

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  };

  const advanceWeb = async (id: string) => {
    setBusy(true);
    try { if (await post(`/api/admin/orders/${id}/advance`, {})) router.refresh(); } finally { setBusy(false); }
  };
  const patchChannel = async (id: string, body: { fulfillmentStatus?: string; paymentStatus?: string }) => {
    setBusy(true);
    try { if (await post("/api/admin/ops/order/status", { orderId: id, ...body })) router.refresh(); } finally { setBusy(false); }
  };
  const markInvoicePaid = async (invoiceId: string) => {
    setBusy(true);
    try { if (await post("/api/admin/ops/invoice", { invoiceId, status: "paid" })) router.refresh(); } finally { setBusy(false); }
  };
  const cancelChannel = async (id: string) => {
    if (!window.confirm("Cancel this order? This returns its stock to inventory, reverses any cash posted, and (for B2B) voids the invoice.")) return;
    setBusy(true);
    try { if (await post("/api/admin/ops/order/cancel", { orderId: id })) router.refresh(); } finally { setBusy(false); }
  };

  const applyBulk = async () => {
    if (selected.size === 0 || (!bulkStage && !bulkPay)) return;
    const map = bulkStage ? STAGE_MAP[bulkStage] : null;
    const chIds = [...selected].filter((k) => k.startsWith("c:")).map((k) => k.slice(2));
    const webIds = [...selected].filter((k) => k.startsWith("w:")).map((k) => k.slice(2));
    setBusy(true);
    try {
      const calls: Promise<boolean>[] = [];
      if (chIds.length && (map?.c || bulkPay)) {
        calls.push(post("/api/admin/ops/order/bulk-status", { orderIds: chIds, fulfillmentStatus: map?.c ?? undefined, paymentStatus: bulkPay || undefined }));
      }
      if (webIds.length && map?.w) {
        calls.push(post("/api/admin/orders/bulk-advance", { orderIds: webIds, target: map.w }));
      }
      await Promise.all(calls);
      clearSel();
      setBulkStage("");
      setBulkPay("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const outstandingTotal = outstanding.reduce((s, i) => s + i.amount, 0);
  // Void invoices belong to cancelled orders — not receivable, so drop them from
  // the AR list (paid ones stay as history).
  const arInvoices = invoices.filter((i) => i.status !== "void");

  const typeChips: [typeof fType, string][] = [["all", "All"], ["website", "Website"], ["channel", "Channel"]];
  const payChips: [typeof fPaid, string][] = [["all", "All"], ["paid", "Paid"], ["unpaid", "Unpaid"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: selected.size > 0 ? 84 : 0 }}>
      <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>All orders</div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, item, channel…"
          style={{ flex: "1 1 200px", minWidth: 160, padding: "9px 13px", borderRadius: 11, border: "1.5px solid var(--line)", background: "#fff", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {typeChips.map(([k, label]) => (
            <button key={k} onClick={() => setFType(k)} style={filterChip(fType === k)}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {payChips.map(([k, label]) => (
            <button key={k} onClick={() => setFPaid(k)} style={filterChip(fPaid === k)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Date-grouped list */}
      {groups.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No orders match.</div>
      ) : (
        groups.map(([dk, list]) => {
          const keys = list.map((r) => r.key);
          const allOn = keys.every((k) => selected.has(k));
          const someOn = keys.some((k) => selected.has(k));
          return (
            <div key={dk}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--choco)" }}>{dateLabel(dk, today, tomorrow)} <span style={{ color: "var(--soft)", fontWeight: 700 }}>· {list.length}</span></div>
                <button onClick={() => toggleGroup(keys, allOn)} style={{ padding: "4px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: someOn ? "var(--surface2)" : "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>
                  {allOn ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {list.map((r) => (
                  <RowCard
                    key={r.key}
                    row={r}
                    invoices={invoices}
                    selected={selected.has(r.key)}
                    busy={busy}
                    onToggle={() => toggle(r.key)}
                    onOpen={r.order ? () => setOpenOrder(r.order!) : undefined}
                    onAdvanceWeb={() => advanceWeb(r.id)}
                    onPatchChannel={(body) => patchChannel(r.id, body)}
                    onMarkInvoicePaid={markInvoicePaid}
                    onCancelChannel={() => cancelChannel(r.id)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Expired website orders */}
      {expired.length > 0 && (
        <div>
          <div style={{ ...sectionLabel, marginTop: 4 }}>EXPIRED · {expired.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {expired.map((o) => (
              <div key={o.id} style={{ padding: 12, borderRadius: 14, background: "#f2ede2", border: "1.5px dashed var(--line)", opacity: 0.7 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: "var(--soft)" }}>#{o.id}</span>
                  <span style={{ fontSize: 12, color: "var(--soft)" }}>{rupiah(o.amount)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>Auto-cancelled — payment expired</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* B2B invoices (AR) — void (cancelled-order) invoices excluded */}
      {arInvoices.length > 0 && (
        <div>
          <div style={sectionLabel}>B2B INVOICES (AR) · {outstanding.length} open · {rupiah(outstandingTotal)}</div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {arInvoices.map((inv) => (
              <InvoiceItem key={inv.id} inv={inv} today={today} busy={busy} onMarkPaid={markInvoicePaid} />
            ))}
          </div>
        </div>
      )}

      {/* Single bulk bar (dark, sticky) */}
      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 12, zIndex: 30 }}>
          <div style={{ background: "var(--dark)", color: "var(--on-dark)", borderRadius: 14, padding: 12, boxShadow: "0 10px 26px rgba(29,19,10,0.3)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 900, fontSize: 13 }}>{selected.size} selected</span>
            <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} style={bulkSelect}>
              <option value="">Set stage…</option>
              {BULK_STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={bulkPay} onChange={(e) => setBulkPay(e.target.value)} style={bulkSelect}>
              <option value="">Set payment…</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            <span style={{ fontSize: 10.5, opacity: 0.7, maxWidth: 220, lineHeight: 1.3 }}>website orders move forward only · payment applies to channel orders</span>
            <span style={{ flex: 1 }} />
            <button onClick={clearSel} style={{ border: "none", background: "transparent", color: "rgba(244,235,221,0.7)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Clear</button>
            <button
              onClick={applyBulk}
              disabled={busy || (!bulkStage && !bulkPay)}
              style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: busy || (!bulkStage && !bulkPay) ? "var(--soft)" : "var(--orange)", color: "#241503", fontWeight: 900, fontSize: 13, cursor: busy || (!bulkStage && !bulkPay) ? "default" : "pointer" }}
            >
              {busy ? "Applying…" : `Apply to ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {openOrder && <AdminOrderDetail order={openOrder} variant="modal" onClose={() => setOpenOrder(null)} />}
    </div>
  );
}

const bulkSelect: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, border: "none", background: "#fff", fontSize: 12.5, fontWeight: 800, color: "var(--ink)", cursor: "pointer" };

function filterChip(on: boolean): React.CSSProperties {
  return { padding: "7px 13px", borderRadius: 999, border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, background: on ? "var(--ink)" : "#fff", color: on ? "var(--on-dark)" : "var(--choco)", fontWeight: 800, fontSize: 12, cursor: "pointer" };
}

// -------------------------------------------------------------- Row card
function RowCard({
  row, invoices, selected, busy, onToggle, onOpen, onAdvanceWeb, onPatchChannel, onMarkInvoicePaid, onCancelChannel,
}: {
  row: UnifiedRow;
  invoices: InvoiceRow[];
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onAdvanceWeb: () => void;
  onPatchChannel: (body: { fulfillmentStatus?: string; paymentStatus?: string }) => void;
  onMarkInvoicePaid: (invoiceId: string) => void;
  onCancelChannel: () => void;
}) {
  const isWeb = row.kind === "website";
  const cancelled = row.co?.status === "cancelled";
  const refunded = row.co?.status === "refunded";

  // Cancelled channel orders render muted, controls off (ledger already reversed).
  if (cancelled) {
    return (
      <div style={{ background: "#f2ede2", border: "1.5px dashed var(--line)", borderRadius: 14, padding: 14, opacity: 0.7, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--soft)", textDecoration: "line-through" }}>{row.title}</span>
          <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", color: "var(--red)", border: "1.5px solid var(--red)", borderRadius: 999, padding: "2px 8px" }}>Cancelled</span>
        </div>
        {row.itemsLine && <div style={{ fontSize: 12.5, color: "var(--soft)" }}>{row.itemsLine}</div>}
        <div style={{ fontSize: 11.5, color: "var(--soft)" }}>{row.badge} · Gross {rupiah(row.gross)} · stock returned, cash reversed</div>
      </div>
    );
  }

  const badgeStyle: React.CSSProperties = isWeb
    ? { background: "#fff3e2", border: "1.5px solid rgba(245,140,33,0.5)", color: "var(--choco)" }
    : { background: "var(--surface2)", border: "1.5px solid var(--line)", color: "var(--soft)" };

  const border = selected ? "1.5px solid var(--orange)" : isWeb && row.isNew ? "2px solid var(--orange)" : "1.5px solid var(--line)";
  const bg = selected ? "var(--surface2)" : "#fff";

  const inv = row.isB2B ? invoices.find((i) => i.salesOrderId === row.id) : undefined;

  return (
    <div
      onClick={onOpen}
      style={{ position: "relative", background: bg, border, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8, cursor: onOpen ? "pointer" : "default" }}
    >
      {isWeb && row.isNew && (
        <div style={{ position: "absolute", top: -9, left: 14, background: "var(--orange)", color: "#fff", fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 999 }}>NEW · PAID</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <label onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ width: 17, height: 17, accentColor: "var(--orange)", cursor: "pointer" }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{row.title}</span>
          <span style={{ ...badgeStyle, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.03em" }}>{row.badge}</span>
        </label>
        {isWeb && (
          <div style={{ fontSize: 12, fontWeight: 800, color: row.overdue ? "var(--red)" : "var(--choco)" }}>
            🛍 pickup {row.order!.pickup_date ?? "—"}{row.overdue ? " · overdue" : ""}
          </div>
        )}
      </div>

      {row.itemsLine && <div style={{ fontSize: 13, color: "var(--ink)" }}>{row.itemsLine}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12.5, color: "var(--soft)" }}>
        <span>Gross <strong style={{ color: "var(--ink)" }}>{rupiah(row.gross)}</strong></span>
        {row.hasFee && row.fee > 0 && <span>Fee <strong style={{ color: "var(--red)" }}>−{rupiah(row.fee)}</strong></span>}
        <span>Net <strong style={{ color: "var(--ink)" }}>{rupiah(row.net)}</strong></span>
        <span>Margin <strong style={{ color: row.margin < 0.3 ? "var(--red)" : "var(--green)" }}>{formatPct(row.margin)}</strong></span>
      </div>

      {/* Footer */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        {isWeb ? (
          <>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: WEB[row.webStatus!].color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: WEB[row.webStatus!].color }}>{WEB[row.webStatus!].label}</span>
            {WEB[row.webStatus!].next && (
              <button onClick={onAdvanceWeb} disabled={busy} style={{ padding: "6px 11px", borderRadius: 999, border: "1.5px solid var(--line)", background: "var(--surface2)", color: "var(--choco)", fontWeight: 800, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}>
                → {WEB[WEB[row.webStatus!].next as WebStatus].label}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--green)" }}>Paid</span>
          </>
        ) : (
          <>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: CH_STAGE[row.co!.fulfillmentStatus]?.color ?? "var(--soft)", flexShrink: 0 }} />
            <select value={row.co!.fulfillmentStatus} disabled={busy} onChange={(e) => onPatchChannel({ fulfillmentStatus: e.target.value })} style={{ padding: "6px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--ink)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
              {CH_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              {/* keep website-only statuses selectable if the row already holds one */}
              {!CH_STAGE[row.co!.fulfillmentStatus] && <option value={row.co!.fulfillmentStatus}>{row.co!.fulfillmentStatus}</option>}
            </select>
            <span style={{ flex: 1 }} />
            {row.isB2B ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 800, color: inv?.status === "paid" ? "var(--green)" : "var(--orange)" }}>
                  invoice {inv?.number ?? "—"} · {inv?.status ?? "—"}
                </span>
                {inv && inv.status !== "paid" && (
                  <button onClick={() => onMarkInvoicePaid(inv.id)} disabled={busy} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--green)", background: "#fff", color: "var(--green)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Mark paid</button>
                )}
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, fontWeight: 800, color: row.paid ? "var(--green)" : "var(--orange)" }}>{row.paid ? "Paid" : "Unpaid"}</span>
                <button onClick={() => onPatchChannel({ paymentStatus: row.paid ? "unpaid" : "paid" })} disabled={busy} style={{ padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${row.paid ? "var(--line)" : "var(--green)"}`, background: "#fff", color: row.paid ? "var(--soft)" : "var(--green)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                  {row.paid ? "Mark unpaid" : "Mark paid"}
                </button>
              </>
            )}
            {!refunded && (
              <button onClick={onCancelChannel} disabled={busy} title="Cancel order & reverse ledger" style={{ padding: "6px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Invoice row
function InvoiceItem({ inv, today, busy, onMarkPaid }: { inv: InvoiceRow; today: string; busy: boolean; onMarkPaid: (id: string) => void }) {
  const bucket = agingBucket(inv.status, inv.dueDate, today);
  // Status-first labels: agingBucket maps BOTH paid and void → "paid", so key off
  // inv.status directly (a bare `${bucket}d overdue` would print "paidd overdue"
  // for a void invoice). Only genuinely-open invoices can be marked paid.
  const isPaid = inv.status === "paid";
  const isVoid = inv.status === "void";
  const label = isPaid ? "paid" : isVoid ? "void" : bucket === "current" ? "current" : `${bucket}d overdue`;
  const labelColor = isVoid ? "var(--soft)" : BUCKET_COLOR[bucket];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
      <div style={{ fontSize: 13 }}>
        <span style={{ fontWeight: 800 }}>{inv.customerRef || "—"}</span>
        <span style={{ color: "var(--soft)" }}> · {inv.number ?? inv.salesOrderId.slice(0, 6)} · due {inv.dueDate ?? "—"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>{rupiah(inv.amount)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: labelColor }}>{label}</span>
        {!isPaid && !isVoid && (
          <button onClick={() => onMarkPaid(inv.id)} disabled={busy} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--green)", background: "#fff", color: "var(--green)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Mark paid</button>
        )}
      </div>
    </div>
  );
}
