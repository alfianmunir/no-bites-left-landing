"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Order, OrderStatus } from "@/lib/orders";
import { nextFulfillmentStatus, canTransition } from "@/lib/orders";
import { PICKUP_LOCATION } from "@/lib/fulfillment";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

// Advance-button copy per next status (README §11).
const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  BAKING: "Advance to Baking ›",
  READY_FOR_PICKUP: "Advance to Ready for pickup ›",
  PICKED_UP: "Mark picked up ✓",
};

// Pickup progression nodes for the mini progress bar.
const PROGRESS: OrderStatus[] = ["PAID", "BAKING", "READY_FOR_PICKUP", "PICKED_UP"];

function waLink(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}`;
}

export default function AdminOrderDetail({ order, backHref = "/admin" }: { order: Order; backHref?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "action failed");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("request failed");
      setBusy(false);
    }
  }

  const next = nextFulfillmentStatus(order.status, order.fulfillment);
  const progressIndex = PROGRESS.indexOf(order.status);
  const phone = order.customer.mobilePhone;
  const customerName = `${order.customer.firstName} ${order.customer.lastName}`.trim();

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1.5px solid var(--line)", background: "#fff" }}>
        <Link href={backHref} className="icon-btn">‹</Link>
        <div style={{ fontWeight: 900, fontSize: 16, color: "var(--choco)" }}>#{order.id}</div>
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div style={{ padding: 12, borderRadius: 14, background: "#fff", border: "1.5px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{customerName || "Customer"}</div>
            <div style={{ fontSize: 12.5, color: "var(--soft)" }}>{phone}</div>
          </div>
          {phone && (
            <a href={waLink(phone)} target="_blank" rel="noreferrer" style={{ padding: "8px 12px", borderRadius: 999, background: "var(--tint-success)", color: "var(--green)", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>
              WhatsApp
            </a>
          )}
        </div>

        <div style={{ padding: 12, borderRadius: 14, background: "#fff", border: "1.5px solid var(--line)", fontSize: 13 }}>
          {order.items.map((it) => (
            <div key={it.sku}>{it.qty}× {it.name}</div>
          ))}
          <div style={{ color: "var(--soft)", marginTop: 4 }}>Pickup at {PICKUP_LOCATION.name}</div>
          <div style={{ color: "var(--soft)" }}>Pickup date: {order.pickup_date ?? "—"} · {rupiah(order.amount)}</div>
        </div>

        {progressIndex >= 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
              {PROGRESS.map((s, i) => (
                <span key={s} style={{ display: "contents" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: i <= progressIndex ? "var(--green)" : "var(--line)" }} />
                  {i < PROGRESS.length - 1 && <span style={{ height: 2, flex: 1, background: i < progressIndex ? "var(--green)" : "var(--line)" }} />}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--soft)", display: "flex", justifyContent: "space-between" }}>
              <span>Paid</span><span>Baking</span><span>Ready</span><span>Picked up</span>
            </div>
          </>
        )}

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
      </div>

      <div style={{ padding: "14px 20px 20px", borderTop: "1.5px solid var(--line)", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
        {next && ADVANCE_LABEL[next] && (
          <button className="btn-calm" disabled={busy} onClick={() => call("advance")}>
            {ADVANCE_LABEL[next]}
          </button>
        )}
        {order.status === "PICKED_UP" && (
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--soft)", fontWeight: 700 }}>Picked up — order complete</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {order.status === "PENDING" && (
            <button className="btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => call("cancel")}>
              Cancel order
            </button>
          )}
          {canTransition(order.status, "REFUNDED", order.fulfillment) && (
            <button
              className="btn-outline"
              style={{ flex: 1, borderColor: "rgba(226,64,38,0.4)", color: "var(--red)" }}
              disabled={busy}
              onClick={() => setConfirmingRefund(true)}
            >
              Refund
            </button>
          )}
        </div>
      </div>

      {confirmingRefund && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(29,19,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 340, background: "#fff", borderRadius: 20, padding: 22 }}>
            <div style={{ fontWeight: 900, fontSize: 17, color: "var(--red)" }}>Refund this order?</div>
            <div style={{ fontSize: 13.5, color: "var(--soft)", marginTop: 8, lineHeight: 1.5 }}>
              This can&apos;t be undone. {rupiah(order.amount)} will be refunded to the customer&apos;s original payment method.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setConfirmingRefund(false)}>Cancel</button>
              <button
                style={{ flex: 1, padding: 12, borderRadius: 12, background: "var(--red)", color: "#fff", fontWeight: 800, fontSize: 13.5, border: "none", cursor: "pointer" }}
                disabled={busy}
                onClick={() => {
                  setConfirmingRefund(false);
                  call("refund");
                }}
              >
                Confirm refund
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
