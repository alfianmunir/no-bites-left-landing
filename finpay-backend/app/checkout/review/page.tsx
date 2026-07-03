"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { useCheckoutDraft } from "@/lib/checkout/CheckoutDraftContext";
import { useClientSession } from "@/lib/useClientSession";
import { formatDeliveryDate } from "@/lib/deliveryDate";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function ReviewPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const { draft, clearDraft } = useCheckoutDraft();
  const { session } = useClientSession();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      router.replace("/");
      return;
    }
    if (!draft.address) {
      router.replace("/checkout/address");
      return;
    }
    if (!draft.courier) {
      router.replace("/checkout/shipping");
      return;
    }
    if (!draft.deliveryDate) {
      router.replace("/checkout/date");
    }
  }, [items.length, draft.address, draft.courier, draft.deliveryDate, router]);

  if (!draft.address || !draft.courier || !draft.deliveryDate || items.length === 0) return null;

  const total = subtotal + draft.courier.fee;

  async function payNow() {
    if (!draft.address || !draft.courier || !draft.deliveryDate) return;
    setPaying(true);
    setError(null);

    // No real customer-contact form in this flow (mock auth, no real Google
    // email yet) — derive it from the delivery recipient + mock session.
    const nameParts = draft.address.recipientName.trim().split(/\s+/);
    const customer = {
      email: session?.email ?? "guest@example.com",
      firstName: nameParts[0] ?? "Guest",
      lastName: nameParts.slice(1).join(" ") || "-",
      mobilePhone: draft.address.phone,
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((l) => ({ sku: l.sku, qty: l.qty })),
          customer,
          deliveryAddress: draft.address,
          courierCode: draft.courier.code,
          deliveryDate: draft.deliveryDate,
        }),
      });
      const data = await res.json();
      if (res.ok && data.redirectUrl) {
        clearCart();
        clearDraft();
        window.location.href = data.redirectUrl;
      } else {
        setError(data.error ?? "Payment initiation failed, please try again.");
        setPaying(false);
      }
    } catch {
      setError("Request failed, please check your connection and try again.");
      setPaying(false);
    }
  }

  if (paying) {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 16 }}>
        <div className="spinner" style={{ borderTopColor: "var(--choco)" }} />
        <div style={{ fontWeight: 800, fontSize: 15.5, color: "var(--choco)" }}>Taking you to our secure payment partner…</div>
        <div style={{ fontSize: 12.5, color: "var(--soft)" }}>Please don&apos;t close this window.</div>
        <div style={{ marginTop: 10, padding: "8px 16px", borderRadius: 999, border: "1.5px solid var(--line)", fontSize: 12, fontWeight: 800, color: "var(--soft)" }}>FINPAY</div>
      </main>
    );
  }

  return (
    <main className="screen-shell" style={{ background: "var(--surface)" }}>
      <div className="top-bar" style={{ background: "var(--surface)" }}>
        <Link href="/checkout/date" className="icon-btn">‹</Link>
        <div className="font-display" style={{ fontSize: 16.5, color: "var(--choco)" }}>Review order</div>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16, flex: 1, overflow: "auto" }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 8 }}>
            ITEMS ({items.reduce((s, l) => s + l.qty, 0)})
          </div>
          {items.map((l) => (
            <div key={l.sku} style={{ fontSize: 13.5, display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{l.qty}× {l.name} {l.variant}</span>
              <span>{rupiah(l.unitPrice * l.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.06em", marginBottom: 6 }}>DELIVERY</div>
          <div style={{ fontSize: 13.5 }}>{formatDeliveryDate(draft.deliveryDate)} · {draft.courier.name}</div>
          <div style={{ fontSize: 13, color: "var(--soft)" }}>{draft.address.fullAddress}</div>
        </div>
        {error && (
          <div style={{ padding: 12, borderRadius: 12, background: "var(--tint-error)", color: "var(--red)", fontSize: 13, fontWeight: 700 }}>
            {error}
          </div>
        )}
        <div style={{ borderTop: "1.5px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--soft)" }}>
            <span>Subtotal</span><span>{rupiah(subtotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--soft)" }}>
            <span>Shipping</span><span>{rupiah(draft.courier.fee)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 900, marginTop: 4 }}>
            <span>Total</span><span>{rupiah(total)}</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "16px 20px 22px", borderTop: "1.5px solid var(--line)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <button className="btn-calm" onClick={payNow}>Pay now · {rupiah(total)}</button>
        <div style={{ fontSize: 11.5, color: "var(--soft)" }}>🔒 Secured by Finpay</div>
      </div>
    </main>
  );
}
