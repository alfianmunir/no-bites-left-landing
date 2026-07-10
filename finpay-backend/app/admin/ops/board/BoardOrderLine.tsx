"use client";

/**
 * One board row + an inline "→ next stage" quick-advance. Channel orders advance
 * through /api/admin/ops/order/status (preparing → packed → in_delivery →
 * delivered). Website orders are display-only here — they advance from the
 * Orders screen (modal + the forward-only website endpoint that emails the
 * customer); the ops/status route doesn't accept their pickup stages anyway.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SalesOrderRow } from "@/lib/opsStore";

const STAGE: Record<string, { label: string; color: string }> = {
  preparing: { label: "Preparing", color: "var(--orange)" },
  packed: { label: "Packed", color: "var(--blue)" },
  ready_for_pickup: { label: "Ready for pickup", color: "var(--choco)" },
  in_delivery: { label: "In delivery", color: "var(--choco)" },
  delivered: { label: "Delivered", color: "var(--green)" },
};
const CH_NEXT: Record<string, string> = { preparing: "packed", packed: "in_delivery", in_delivery: "delivered" };

export default function BoardOrderLine({ o, itemsLine }: { o: SalesOrderRow; itemsLine: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const st = STAGE[o.fulfillmentStatus];
  const isWebsite = o.channel === "website";
  const next = CH_NEXT[o.fulfillmentStatus];
  const canAdvance = !isWebsite && !!next;

  const advance = async () => {
    if (!next) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/order/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: o.id, fulfillmentStatus: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
      <div style={{ minWidth: 150, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {isWebsite ? "🛍 " : ""}{o.customerRef || "—"} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 11.5 }}>· {o.channel}</span>
          {o.paymentStatus === "unpaid" && o.channel !== "b2b" && <span style={{ color: "var(--orange)", fontWeight: 800, fontSize: 11 }}> · unpaid</span>}
        </div>
        {itemsLine && <div style={{ fontSize: 12, color: "var(--soft)" }}>{itemsLine}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
        {o.pickupDate && <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--choco)" }}>🛍 {o.pickupDate}</span>}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: st?.color ?? "var(--soft)", borderRadius: 999, padding: "2px 8px" }}>{st?.label ?? o.fulfillmentStatus}</span>
        {canAdvance && (
          <button onClick={advance} disabled={busy} style={{ padding: "5px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "var(--surface2)", color: "var(--choco)", fontWeight: 800, fontSize: 11, cursor: busy ? "default" : "pointer" }}>
            → {STAGE[next].label}
          </button>
        )}
      </div>
    </div>
  );
}
