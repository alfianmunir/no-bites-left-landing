"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCheckoutDraft } from "@/lib/checkout/CheckoutDraftContext";
import { useCart } from "@/lib/cart/CartContext";
import { lookupCourierRates, type CourierOption, type RateLookupResult } from "@/lib/courier";

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function ShippingPage() {
  const router = useRouter();
  const { draft, setCourier } = useCheckoutDraft();
  const { subtotal } = useCart();
  const [result, setResult] = useState<RateLookupResult | null>(null);
  const [selected, setSelected] = useState<CourierOption | null>(null);

  useEffect(() => {
    if (!draft.address) {
      router.replace("/checkout/address");
      return;
    }
    let cancelled = false;
    setResult(null);
    lookupCourierRates(draft.address.area).then((r) => {
      if (cancelled) return;
      setResult(r);
      if (r.status === "ok") setSelected(r.options[0]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.address?.area]);

  function retry() {
    if (!draft.address) return;
    setResult(null);
    lookupCourierRates(draft.address.area).then((r) => {
      setResult(r);
      if (r.status === "ok") setSelected(r.options[0]);
    });
  }

  function continueToDate() {
    if (!selected) return;
    setCourier(selected);
    router.push("/checkout/date");
  }

  if (!draft.address) return null;

  if (!result) {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, gap: 16 }}>
        <div className="spinner" />
        <div style={{ fontWeight: 800, fontSize: 15 }}>Checking couriers near you…</div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 58, borderRadius: 14, background: "var(--surface2)" }} />
          ))}
        </div>
      </main>
    );
  }

  if (result.status === "failed") {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 12 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--surface2)", border: "1.5px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--soft)" }}>!</div>
        <div className="font-display" style={{ fontSize: 18 }}>Couldn&apos;t check delivery rates</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)" }}>A connection hiccup on our end. Please try again.</div>
        <button onClick={retry} className="btn-primary" style={{ width: "auto", padding: "13px 26px", marginTop: 8 }}>Retry</button>
        <Link href="/checkout/address" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>Edit address</Link>
      </main>
    );
  }

  if (result.status === "out_of_coverage") {
    return (
      <main className="screen-shell">
        <div className="top-bar">
          <Link href="/checkout/address" className="icon-btn">‹</Link>
          <div className="font-display" style={{ fontSize: 16.5 }}>Delivery Address</div>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <label>
            <span className="field-label">Area / Kecamatan</span>
            <div className="field-input" style={{ borderColor: "var(--red)" }}>{draft.address.area}</div>
          </label>
          <div style={{ padding: 16, borderRadius: 16, background: "var(--tint-error)", border: "1.5px solid rgba(226,64,38,0.25)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--red)" }}>We only deliver within Jakarta for now — DM us anyway 🍪</div>
            <a
              href="https://wa.me/6281776376636"
              target="_blank"
              rel="noreferrer"
              style={{ alignSelf: "flex-start", padding: "10px 16px", borderRadius: 999, background: "#fff", border: "1.5px solid var(--red)", color: "var(--red)", fontWeight: 800, fontSize: 13, textDecoration: "none" }}
            >
              Message us on WhatsApp
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (result.status === "no_couriers") {
    return (
      <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 12 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--surface2)", border: "1.5px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🛵</div>
        <div className="font-display" style={{ fontSize: 18 }}>No couriers available right now</div>
        <div style={{ fontSize: 13.5, color: "var(--soft)", maxWidth: 250 }}>Try again in a few minutes, or double check your address.</div>
        <button onClick={retry} className="btn-primary" style={{ width: "auto", padding: "13px 26px", marginTop: 8 }}>Try again</button>
        <Link href="/checkout/address" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>Edit address</Link>
      </main>
    );
  }

  const total = subtotal + (selected?.fee ?? 0);

  return (
    <main className="screen-shell">
      <div className="top-bar">
        <Link href="/checkout/address" className="icon-btn">‹</Link>
        <div className="font-display" style={{ fontSize: 16.5 }}>Choose a courier</div>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {result.options.map((c) => (
          <div
            key={c.code}
            onClick={() => setSelected(c)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 14,
              border: `${selected?.code === c.code ? 2 : 1.5}px solid ${selected?.code === c.code ? "var(--orange)" : "var(--line)"}`,
              borderRadius: 16,
              background: "var(--surface)",
              cursor: "pointer",
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13 }}>
              {c.name.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--soft)" }}>{c.etaLabel}</div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>{rupiah(c.fee)}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "16px 20px 22px", borderTop: "1.5px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
          <span style={{ color: "var(--soft)" }}>Items + shipping</span>
          <span style={{ fontWeight: 800 }}>{rupiah(total)}</span>
        </div>
        <button className="btn-primary" disabled={!selected} onClick={continueToDate}>Continue</button>
      </div>
    </main>
  );
}
