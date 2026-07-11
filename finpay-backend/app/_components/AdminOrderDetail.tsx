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

// Advance-button copy per next status. Website pickup vocabulary:
// preparing → packed → ready for pickup → picked up. (The single-axis status
// names map: PAID=preparing, BAKING=packed, READY_FOR_PICKUP, PICKED_UP.)
const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  BAKING: "Advance to Packed ›",
  READY_FOR_PICKUP: "Advance to Ready for pickup ›",
  PICKED_UP: "Mark picked up ✓",
};

// Pickup progression nodes for the mini progress bar + their display labels.
const PROGRESS: OrderStatus[] = ["PAID", "BAKING", "READY_FOR_PICKUP", "PICKED_UP"];
const PROGRESS_LABELS = ["Preparing", "Packed", "Ready", "Picked up"];

// Normalize an Indonesian mobile to international digits for wa.me (leading 0 → 62).
function waIntl(phone: string): string {
  let d = phone.replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}
function waLink(phone: string): string {
  return `https://wa.me/${waIntl(phone)}`;
}
/** wa.me deep link with a pre-typed message. */
function waLinkText(phone: string, message: string): string {
  return `https://wa.me/${waIntl(phone)}?text=${encodeURIComponent(message)}`;
}

export default function AdminOrderDetail({
  order,
  backHref = "/admin",
  variant = "page",
  onClose,
}: {
  order: Order;
  backHref?: string;
  variant?: "page" | "modal";
  onClose?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDone, setCancelDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

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
      // In a modal the `order` prop is a snapshot; close so the parent list
      // re-renders with the fresh status instead of showing stale data.
      router.refresh();
      if (isModal) onClose?.();
    } catch {
      setError("request failed");
      setBusy(false);
    }
  }

  const next = nextFulfillmentStatus(order.status, order.fulfillment);
  const progressIndex = PROGRESS.indexOf(order.status);
  const phone = order.customer.mobilePhone;
  const customerName = `${order.customer.firstName} ${order.customer.lastName}`.trim();
  const firstName = order.customer.firstName || customerName || "there";

  // The exact WhatsApp script the admin sends after cancelling (refund handled
  // outside the app — we ask for the customer's bank account here).
  const cancelWaMessage = `Hi ${firstName}! We are deeply sorry that we have to cancel your order in nobitesleft.com due to ${cancelReason.trim() || "…"}. Please inform your bank account number so we can process the refund. Thank you for your understanding.`;

  async function submitCancelRefund() {
    if (!cancelReason.trim()) {
      setError("Please enter a cancellation reason.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/cancel-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "cancellation failed");
        setBusy(false);
        return;
      }
      router.refresh(); // parent list picks up the REFUNDED status
      setConfirmingCancel(false);
      setCancelDone(true); // keep the modal open to show the WhatsApp CTA
      setBusy(false);
    } catch {
      setError("request failed");
      setBusy(false);
    }
  }

  const body = (
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
            {PROGRESS_LABELS.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </>
      )}

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
    </div>
  );

  const footer = (
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
            onClick={() => { setCancelReason(""); setError(null); setConfirmingCancel(true); }}
          >
            Cancel &amp; refund
          </button>
        )}
      </div>
    </div>
  );

  // Cancel + manual refund: enter a reason → order REFUNDED, ledger reversed,
  // customer emailed. Refund money is sent outside the app.
  const cancelDialog = confirmingCancel && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,19,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 60 }} onClick={(e) => { e.stopPropagation(); if (!busy) setConfirmingCancel(false); }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 900, fontSize: 17, color: "var(--red)" }}>Cancel &amp; refund this order?</div>
        <div style={{ fontSize: 13, color: "var(--soft)", marginTop: 8, lineHeight: 1.5 }}>
          Marks {order.id} <b>refunded</b> ({rupiah(order.amount)}), returns its stock and reverses the sale in the ledger, and emails the customer. The refund itself is processed outside the app.
        </div>
        <label style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", margin: "14px 0 4px" }}>Cancellation reason</label>
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="e.g. an ingredient sold out"
          rows={3}
          maxLength={300}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)", fontSize: 13.5, fontFamily: "inherit", color: "var(--ink)", boxSizing: "border-box", resize: "vertical" }}
        />
        {error && <div style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700, marginTop: 6 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => setConfirmingCancel(false)}>Back</button>
          <button
            style={{ flex: 1, padding: 12, borderRadius: 12, background: busy || !cancelReason.trim() ? "var(--soft)" : "var(--red)", color: "#fff", fontWeight: 800, fontSize: 13.5, border: "none", cursor: busy || !cancelReason.trim() ? "default" : "pointer" }}
            disabled={busy || !cancelReason.trim()}
            onClick={submitCancelRefund}
          >
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </div>
    </div>
  );

  // After cancelling: the WhatsApp CTA, pre-typed with the apology + refund ask.
  const cancelSuccess = cancelDone && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,19,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 60 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 22 }}>
        <div style={{ fontWeight: 900, fontSize: 17, color: "var(--choco)" }}>Order cancelled &amp; refunded</div>
        <div style={{ fontSize: 13, color: "var(--soft)", marginTop: 8, lineHeight: 1.5 }}>
          {customerName || "The customer"} has been emailed. Message them on WhatsApp to collect their bank account for the refund:
        </div>
        <div style={{ margin: "12px 0", padding: "10px 12px", borderRadius: 12, background: "var(--surface2)", border: "1.5px solid var(--line)", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5, fontStyle: "italic" }}>
          {cancelWaMessage}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setCancelDone(false); if (isModal) onClose?.(); }}>Done</button>
          {phone && (
            <a
              href={waLinkText(phone, cancelWaMessage)}
              target="_blank"
              rel="noreferrer"
              style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 12, background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}
            >
              WhatsApp customer
            </a>
          )}
        </div>
      </div>
    </div>
  );

  // --- Modal variant: centered overlay card (used from the ops pickup queue) ---
  if (isModal) {
    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(29,19,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
        onClick={() => onClose?.()}
      >
        <div
          style={{ width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", background: "var(--surface2)", borderRadius: 20, display: "flex", flexDirection: "column" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "1.5px solid var(--line)", background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: "var(--choco)" }}>#{order.id}</div>
            <button className="icon-btn" onClick={() => onClose?.()} aria-label="Close">×</button>
          </div>
          {body}
          {footer}
        </div>
        {cancelDialog}
        {cancelSuccess}
      </div>
    );
  }

  // --- Page variant (standalone) ---
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1.5px solid var(--line)", background: "#fff" }}>
        <Link href={backHref} className="icon-btn">‹</Link>
        <div style={{ fontWeight: 900, fontSize: 16, color: "var(--choco)" }}>#{order.id}</div>
      </div>
      {body}
      {footer}
      {cancelDialog}
        {cancelSuccess}
    </main>
  );
}
