"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCheckoutDraft } from "@/lib/checkout/CheckoutDraftContext";
import { useClientSession } from "@/lib/useClientSession";
import type { DeliveryAddress } from "@/lib/orders";
import type { SavedAddress } from "@/lib/addressStore";

type Mode = "loading" | "picker" | "form";

const EMPTY_FORM = { label: "", recipientName: "", phone: "", area: "", fullAddress: "", notes: "" };

export default function AddressPage() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useClientSession();
  const { draft, setAddress } = useCheckoutDraft();
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [mode, setMode] = useState<Mode>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      router.replace("/");
      return;
    }
    fetch("/api/addresses")
      .then((r) => r.json())
      .then((data: { addresses: SavedAddress[] }) => {
        setSaved(data.addresses);
        if (data.addresses.length > 0) {
          setSelectedId(data.addresses[0].id);
          setMode("picker");
        } else {
          setMode("form");
        }
      });
  }, [session, sessionLoading, router]);

  function startNewAddress() {
    setForm(EMPTY_FORM);
    setMode("form");
  }

  async function useSelected() {
    const chosen = saved.find((a) => a.id === selectedId);
    if (!chosen) return;
    setAddress({
      recipientName: chosen.recipientName,
      phone: chosen.phone,
      area: chosen.area,
      fullAddress: chosen.fullAddress,
      notes: chosen.notes,
    });
    router.push("/checkout/shipping");
  }

  async function submitForm() {
    const address: DeliveryAddress = {
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim(),
      area: form.area.trim(),
      fullAddress: form.fullAddress.trim(),
      notes: form.notes.trim() || undefined,
    };
    if (!address.recipientName || !address.phone || !address.area || !address.fullAddress) return;

    setSaving(true);
    setAddress(address);
    try {
      await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...address, label: form.label.trim() || undefined }),
      });
    } catch {
      // Saving for reuse is best-effort; the draft already has the address.
    }
    router.push("/checkout/shipping");
  }

  const formValid = form.recipientName.trim() && form.phone.trim() && form.area.trim() && form.fullAddress.trim();

  if (mode === "loading") {
    return (
      <main className="screen-shell">
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="spinner" />
        </div>
      </main>
    );
  }

  if (mode === "picker") {
    return (
      <main className="screen-shell">
        <div className="top-bar">
          <Link href="/" className="icon-btn">‹</Link>
          <div className="font-display" style={{ fontSize: 16.5 }}>Choose address</div>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          {saved.map((a) => (
            <div
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              style={{
                padding: 14,
                border: `2px solid ${selectedId === a.id ? "var(--orange)" : "var(--line)"}`,
                borderWidth: selectedId === a.id ? 2 : 1.5,
                borderRadius: 16,
                background: "var(--surface)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{a.label}</span>
                {selectedId === a.id && (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "var(--orange)",
                      color: "#fff",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✓
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--soft)", marginTop: 4 }}>
                {a.recipientName} · {a.phone}
              </div>
              <div style={{ fontSize: 13, color: "var(--soft)" }}>{a.fullAddress}</div>
            </div>
          ))}
          <div
            onClick={startNewAddress}
            style={{
              padding: 14,
              border: "1.5px dashed var(--line)",
              borderRadius: 16,
              textAlign: "center",
              fontWeight: 800,
              fontSize: 13.5,
              color: "var(--orange)",
              cursor: "pointer",
            }}
          >
            + Add new address
          </div>
        </div>
        <div style={{ padding: "16px 20px 22px", borderTop: "1.5px solid var(--line)" }}>
          <button className="btn-primary" disabled={!selectedId} onClick={useSelected}>
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-shell">
      <div className="top-bar">
        <Link href="/" className="icon-btn">‹</Link>
        <div className="font-display" style={{ fontSize: 16.5 }}>Delivery Address</div>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1, overflow: "auto" }}>
        {saved.length > 0 && (
          <a onClick={() => setMode("picker")} style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 800, color: "var(--orange)" }}>
            Use a saved address ›
          </a>
        )}
        <label>
          <span className="field-label">Label (optional — e.g. Home, Office)</span>
          <input className="field-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Recipient name</span>
          <input className="field-input" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Phone number</span>
          <input className="field-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+62…" />
        </label>
        <label>
          <span className="field-label">Area / Kecamatan</span>
          <input className="field-input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Kebagusan, Ps. Minggu" />
        </label>
        <label>
          <span className="field-label">Full address</span>
          <textarea
            className="field-input"
            style={{ minHeight: 64, resize: "vertical" }}
            value={form.fullAddress}
            onChange={(e) => setForm({ ...form, fullAddress: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Notes / landmark (optional)</span>
          <input
            className="field-input"
            style={{ borderStyle: "dashed", background: "var(--surface2)" }}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Near the blue gate, ring the bell"
          />
        </label>
      </div>
      <div style={{ padding: "16px 20px 22px", borderTop: "1.5px solid var(--line)" }}>
        <button className="btn-primary" disabled={!formValid || saving} onClick={submitForm}>
          {saving ? "Saving…" : "Check delivery rates"}
        </button>
      </div>
    </main>
  );
}
