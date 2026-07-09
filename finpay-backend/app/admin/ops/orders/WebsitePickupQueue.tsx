"use client";

/**
 * Website orders queue — the storefront orders that need fulfilling, read from
 * ops.sales_orders (via getStore) on the server and passed in here. Grouped by
 * pickup date; clicking a card opens the order-detail MODAL (no separate page)
 * where the lifecycle actions live: advance (preparing → packed → ready for
 * pickup → picked up, forward-only + timestamped) → customer email, and
 * cancel/refund → Finpay.
 *
 * Bulk status: each card has a checkbox; the sticky bar advances every selected
 * order forward to a target status via /api/admin/orders/bulk-advance (forward-
 * only — orders already at/past the target are skipped, never moved back).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Order } from "@/lib/orders";
import AdminOrderDetail from "@/app/_components/AdminOrderDetail";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function groupLabel(dateStr: string | null, today: string, tomorrow: string): string {
  if (!dateStr) return "NO DATE SET";
  if (dateStr === today) return "TODAY";
  if (dateStr === tomorrow) return "TOMORROW";
  return dateStr > tomorrow ? "UPCOMING" : "PAST DUE";
}

// Single-axis status → website pickup label (PAID=preparing, BAKING=packed).
const STATUS_LABEL: Record<string, string> = {
  PAID: "Preparing",
  BAKING: "Packed",
  READY_FOR_PICKUP: "Ready for pickup",
};

// Bulk targets, in chain order (forward-only; server skips at/past-target orders).
const BULK_TARGETS = [
  { value: "BAKING", label: "Packed" },
  { value: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { value: "PICKED_UP", label: "Picked up" },
];

const GROUP_ORDER = ["PAST DUE", "TODAY", "TOMORROW", "UPCOMING", "NO DATE SET"];

export default function WebsitePickupQueue({
  active,
  expired,
  today,
  tomorrow,
}: {
  active: Order[];
  expired: Order[];
  today: string;
  tomorrow: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);

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
    if (selected.size === 0 || !target) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/orders/bulk-advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [...selected], target }),
      });
      if (res.ok) {
        clearSel();
        setTarget("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const groups = new Map<string, Order[]>();
  for (const o of [...active].sort((a, b) => (a.pickup_date ?? "").localeCompare(b.pickup_date ?? ""))) {
    const label = groupLabel(o.pickup_date, today, tomorrow);
    groups.set(label, [...(groups.get(label) ?? []), o]);
  }

  if (active.length === 0 && expired.length === 0) {
    return (
      <div style={{ padding: "36px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
        <div style={{ fontSize: 28 }}>🎉</div>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>No website orders need attention</div>
        <div style={{ fontSize: 12.5, color: "var(--soft)" }}>Paid storefront pickups will land here automatically.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: selected.size > 0 ? 84 : 0 }}>
      {GROUP_ORDER.filter((g) => groups.has(g)).map((g) => {
        const list = groups.get(g)!;
        const ids = list.map((o) => o.id);
        const allOn = ids.every((id) => selected.has(id));
        const someOn = ids.some((id) => selected.has(id));
        return (
          <div key={g}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em" }}>
                {g} · {list.length}
              </div>
              <button
                onClick={() => toggleGroup(ids, allOn)}
                style={{ padding: "4px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: someOn ? "var(--surface2)" : "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}
              >
                {allOn ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((o) => {
                const isNew = o.status === "PAID"; // needs ack until an admin advances it
                return (
                  <div
                    key={o.id}
                    onClick={() => setOpenOrder(o)}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: "#fff",
                      border: isNew ? "2px solid var(--orange)" : "1.5px solid var(--line)",
                      position: "relative",
                      cursor: "pointer",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    {isNew && (
                      <div style={{ position: "absolute", top: -9, left: 12, background: "var(--orange)", color: "#fff", fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 999 }}>
                        NEW · PAID
                      </div>
                    )}
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`select ${o.id}`}
                      style={{ marginTop: 6, width: 16, height: 16, accentColor: "var(--choco)", cursor: "pointer", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontWeight: 800, fontSize: 13.5 }}>#{o.id}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--green)" }}>{rupiah(o.amount)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>
                        {o.customer.firstName} {o.customer.lastName} · {o.customer.mobilePhone}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--soft)" }}>
                        {o.items.reduce((s, it) => s + it.qty, 0)} items{o.pickup_date ? ` · pickup ${o.pickup_date}` : ""}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "var(--choco)" }}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {expired.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 8 }}>
            EXPIRED · {expired.length}
          </div>
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

      {/* Sticky bulk action bar (forward-only status setting) */}
      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 12, zIndex: 30 }}>
          <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 12, boxShadow: "0 6px 20px rgba(40,26,11,0.18)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: "var(--choco)" }}>{selected.size} selected</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", fontSize: 12.5, fontWeight: 800, color: "var(--ink)", cursor: "pointer" }}>
              <option value="">Set status…</option>
              {BULK_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <span style={{ fontSize: 11, color: "var(--soft)", fontWeight: 600 }}>forward only — orders already past the status are skipped</span>
            <span style={{ flex: 1 }} />
            <button onClick={clearSel} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Clear</button>
            <button
              onClick={applyBulk}
              disabled={busy || !target}
              style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: busy || !target ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: busy || !target ? "default" : "pointer" }}
            >
              {busy ? "Applying…" : `Apply to ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {openOrder && (
        <AdminOrderDetail order={openOrder} variant="modal" onClose={() => setOpenOrder(null)} />
      )}
    </div>
  );
}
