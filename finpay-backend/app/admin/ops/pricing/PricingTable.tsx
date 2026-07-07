"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeSkuPricing, formatPct, type PricingConfig, type PricingProductInput } from "@/lib/opsPricing";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: 110, padding: "8px 10px", borderRadius: 9, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};

export default function PricingTable({ products, config }: { products: PricingProductInput[]; config: PricingConfig }) {
  const router = useRouter();
  // Live what-if waste rate (defaults to config). Not persisted — lets Munir see
  // margin sensitivity before the trailing-30d actual replaces the planning rate.
  const [wastePct, setWastePct] = useState(Math.round(config.wasteRate * 100));
  // Candidate prices being edited, keyed by product id (string inputs).
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, String(Math.round(p.listPrice))])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wasteRate = Math.min(0.95, Math.max(0, (Number(wastePct) || 0) / 100));

  const rows = useMemo(
    () =>
      products.map((p) => {
        const draft = Number(drafts[p.id]);
        const candidate = Number.isFinite(draft) && draft > 0 ? draft : p.listPrice;
        // Two computations: the SAVED price (source of truth) and the CANDIDATE
        // price being typed — both at the live what-if waste rate.
        const saved = computeSkuPricing(p, config, wasteRate);
        const trial = computeSkuPricing({ ...p, listPrice: candidate }, config, wasteRate);
        return { p, saved, trial, candidate, dirty: Math.round(candidate) !== Math.round(p.listPrice) };
      }),
    [products, drafts, config, wasteRate],
  );

  const save = async (id: string, price: number) => {
    setError(null);
    setSavingId(id);
    try {
      const res = await fetch("/api/admin/ops/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id, listPrice: price }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Price update failed.");
      } else {
        setSavedId(id);
        setTimeout(() => setSavedId((s) => (s === id ? null : s)), 2500);
        router.refresh(); // pull the new list price back as the saved baseline
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14, padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, color: "var(--soft)" }}>Waste rate</span>
          <input type="number" min="0" max="95" value={wastePct} onChange={(e) => setWastePct(Number(e.target.value))} style={{ ...inputStyle, width: 68 }} />
          <span style={{ color: "var(--soft)" }}>%</span>
          {Math.round(config.wasteRate * 100) !== wastePct && (
            <button onClick={() => setWastePct(Math.round(config.wasteRate * 100))} style={{ border: "none", background: "transparent", color: "var(--choco)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>reset</button>
          )}
        </div>
        <div style={{ color: "var(--soft)" }}>Floor <strong style={{ color: "var(--ink)" }}>{formatPct(config.marginFloor)}</strong> · B2B margin <strong style={{ color: "var(--ink)" }}>{formatPct(config.b2bMargin)}</strong></div>
        <div style={{ fontSize: 11.5, color: "var(--soft)" }}>Effective cost = std cost ÷ (1 − waste). Margins recompute as costs & price change.</div>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(({ p, saved, trial, candidate, dirty }) => {
          const shown = dirty ? trial : saved;
          return (
            <div key={p.id} style={{ background: "#fff", border: `1.5px solid ${shown.belowFloor ? "var(--red)" : "var(--line)"}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                  {p.name} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12 }}>{p.sku}{p.isBundle ? " · bundle" : ""}</span>
                </div>
                <span
                  style={{
                    fontSize: 12, fontWeight: 900, padding: "3px 10px", borderRadius: 999,
                    background: shown.belowFloor ? "#fdecec" : "var(--tint-success)",
                    color: shown.belowFloor ? "var(--red)" : "var(--green)",
                  }}
                >
                  {formatPct(shown.margin)} {shown.belowFloor ? `· below ${formatPct(shown.floor)} floor` : "margin"}
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginTop: 8, fontSize: 12.5, color: "var(--soft)" }}>
                <span>Std cost <strong style={{ color: "var(--ink)" }}>{rupiah(p.stdCost)}</strong></span>
                <span>Effective <strong style={{ color: "var(--ink)" }}>{rupiah(shown.effCost)}</strong></span>
                <span>Break-even (floor) <strong style={{ color: "var(--ink)" }}>{rupiah(shown.floorPrice)}</strong></span>
                <span>B2B price <strong style={{ color: "var(--ink)" }}>{rupiah(shown.b2bPrice)}</strong></span>
              </div>

              {shown.b2bPrice > p.listPrice && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--red)", fontWeight: 700 }}>
                  ⚠ B2B price exceeds retail — don&apos;t wholesale at this price.
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)" }}>List price</label>
                <input
                  type="number" inputMode="numeric" min="0"
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  style={inputStyle}
                />
                <button
                  onClick={() => save(p.id, candidate)}
                  disabled={!dirty || savingId === p.id}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13,
                    cursor: !dirty || savingId === p.id ? "default" : "pointer",
                    background: !dirty ? "var(--line)" : "var(--choco)",
                    color: !dirty ? "var(--soft)" : "#fff",
                  }}
                >
                  {savingId === p.id ? "Saving…" : dirty ? "Save price" : savedId === p.id ? "✓ Saved" : "Saved"}
                </button>
                {dirty && (
                  <button onClick={() => setDrafts((d) => ({ ...d, [p.id]: String(Math.round(p.listPrice)) }))} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    cancel
                  </button>
                )}
                <button
                  onClick={() => setDrafts((d) => ({ ...d, [p.id]: String(Math.ceil(shown.floorPrice / 500) * 500) }))}
                  style={{ border: "1.5px dashed var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "6px 10px", borderRadius: 999 }}
                  title="Set the price to just clear the margin floor"
                >
                  → floor price
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
