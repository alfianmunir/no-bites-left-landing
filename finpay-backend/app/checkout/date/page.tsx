"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCheckoutDraft } from "@/lib/checkout/CheckoutDraftContext";
import { getDateWindow, getEarliestDeliveryDate, formatDeliveryDate } from "@/lib/deliveryDate";

// Demo toggle: no real bake-capacity backend exists yet (PRD §9 open item).
const CAPACITY_CLOSED_DEMO = false;

export default function DeliveryDatePage() {
  const router = useRouter();
  const { draft, setDeliveryDate } = useCheckoutDraft();
  const options = useMemo(() => getDateWindow(), []);
  const [selected, setSelected] = useState<string>(draft.deliveryDate ?? getEarliestDeliveryDate());

  useEffect(() => {
    if (!draft.courier) router.replace("/checkout/shipping");
  }, [draft.courier, router]);

  if (!draft.courier) return null;

  function continueToReview() {
    setDeliveryDate(selected);
    router.push("/checkout/review");
  }

  if (CAPACITY_CLOSED_DEMO) {
    return (
      <main className="screen-shell">
        <div className="top-bar">
          <Link href="/checkout/shipping" className="icon-btn">‹</Link>
          <div className="font-display" style={{ fontSize: 16.5 }}>Pick a delivery date</div>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: 14, borderRadius: 16, background: "var(--tint-error)", border: "1.5px solid rgba(226,64,38,0.25)", fontSize: 13, color: "var(--red)", fontWeight: 700, lineHeight: 1.5 }}>
            We&apos;re fully booked for a while — check back soon for more bake slots!
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {options.slice(0, 4).map((d) => (
              <div key={d.date} style={{ padding: "10px 0", borderRadius: 12, background: "var(--surface2)", color: "var(--soft)", textAlign: "center", opacity: 0.4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800 }}>{d.weekday}</div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: "auto", padding: "16px 20px 22px", borderTop: "1.5px solid var(--line)" }}>
          <button className="btn-primary" disabled style={{ background: "var(--line)", color: "var(--soft)" }}>No dates available</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-shell">
      <div className="top-bar">
        <Link href="/checkout/shipping" className="icon-btn">‹</Link>
        <div className="font-display" style={{ fontSize: 16.5 }}>Pick a delivery date</div>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        <div style={{ padding: 14, borderRadius: 16, background: "var(--surface2)", fontSize: 13, color: "var(--soft)", lineHeight: 1.5 }}>
          Every batch is baked fresh to order — that takes 3 days 🍪
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {options.map((d) => {
            const isSelected = selected === d.date;
            return (
              <div
                key={d.date}
                onClick={() => !d.disabled && setSelected(d.date)}
                style={{
                  padding: "10px 0",
                  borderRadius: 12,
                  textAlign: "center",
                  cursor: d.disabled ? "default" : "pointer",
                  background: d.disabled ? "var(--surface2)" : isSelected ? "var(--orange)" : "transparent",
                  color: d.disabled ? "var(--soft)" : isSelected ? "#fff" : "var(--ink)",
                  opacity: d.disabled ? 0.45 : 1,
                  border: !d.disabled && !isSelected ? "1.5px solid var(--line)" : "none",
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 800, color: d.disabled || isSelected ? undefined : "var(--soft)" }}>{d.weekday}</div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{d.day}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: "var(--soft)" }}>
          Selected: <b style={{ color: "var(--ink)" }}>{formatDeliveryDate(selected)}</b> · window opens 14 days out
        </div>
      </div>
      <div style={{ padding: "16px 20px 22px", borderTop: "1.5px solid var(--line)" }}>
        <button className="btn-primary" onClick={continueToReview}>Continue</button>
      </div>
    </main>
  );
}
