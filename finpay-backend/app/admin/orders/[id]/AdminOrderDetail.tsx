"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Order, FulfillmentStage } from "@/lib/orders";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const STAGE_LABEL: Record<FulfillmentStage, string> = {
  baking: "Baking",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

function nextStage(stage: FulfillmentStage | null): FulfillmentStage | null {
  if (stage === null || stage === "baking") return "out_for_delivery";
  if (stage === "out_for_delivery") return "delivered";
  return null;
}

function waLink(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}`;
}

export default function AdminOrderDetail({ order }: { order: Order }) {
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

  const stage = nextStage(order.fulfillment_stage);
  const stageProgressIndex = order.fulfillment_stage
    ? ["baking", "out_for_delivery", "delivered"].indexOf(order.fulfillment_stage)
    : -1;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1.5px solid var(--line)", background: "#fff" }}>
        <Link href="/admin" className="icon-btn">‹</Link>
        <div style={{ fontWeight: 900, fontSize: 16, color: "var(--choco)" }}>#{order.id}</div>
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div style={{ padding: 12, borderRadius: 14, background: "#fff", border: "1.5px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{order.delivery_address?.recipientName}</div>
            <div style={{ fontSize: 12.5, color: "var(--soft)" }}>{order.delivery_address?.phone}</div>
          </div>
          {order.delivery_address?.phone && (
            <a href={waLink(order.delivery_address.phone)} target="_blank" rel="noreferrer" style={{ padding: "8px 12px", borderRadius: 999, background: "var(--tint-success)", color: "var(--green)", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>
              WhatsApp
            </a>
          )}
        </div>

        <div style={{ padding: 12, borderRadius: 14, background: "#fff", border: "1.5px solid var(--line)", fontSize: 13 }}>
          {order.items.map((it) => (
            <div key={it.sku}>{it.qty}× {it.name}</div>
          ))}
          <div style={{ color: "var(--soft)", marginTop: 4 }}>
            {order.courier?.name} · {order.delivery_address?.fullAddress}
          </div>
          <div style={{ color: "var(--soft)" }}>Delivery date: {order.delivery_date} · {rupiah(order.amount)}</div>
        </div>

        {["PAID", "FULFILLED"].includes(order.status) && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
              {["Paid", "Baking", "Delivery", "Done"].map((label, i) => (
                <span key={label} style={{ display: "contents" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: i <= stageProgressIndex + 1 ? "var(--green)" : "var(--line)" }} />
                  {i < 3 && <span style={{ height: 2, flex: 1, background: i < stageProgressIndex + 1 ? "var(--green)" : "var(--line)" }} />}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--soft)", display: "flex", justifyContent: "space-between" }}>
              <span>Paid</span><span>Baking</span><span>Delivery</span><span>Done</span>
            </div>
          </>
        )}

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
      </div>

      <div style={{ padding: "14px 20px 20px", borderTop: "1.5px solid var(--line)", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
        {order.status === "PAID" && stage && (
          <button className="btn-calm" disabled={busy} onClick={() => call("advance")}>
            Mark as {STAGE_LABEL[stage]}
          </button>
        )}
        {order.status === "FULFILLED" && (
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--soft)", fontWeight: 700 }}>Delivered — order complete</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {order.status === "PENDING" && (
            <button className="btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => call("cancel")}>
              Cancel order
            </button>
          )}
          {(order.status === "PAID" || order.status === "FULFILLED") && (
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
