"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeSkuPricing, formatPct, type PricingConfig, type PricingProductInput } from "@/lib/opsPricing";

function rupiah(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
const clampFrac = (pct: number) => Math.min(0.95, Math.max(0, (Number(pct) || 0) / 100));

const inputStyle: React.CSSProperties = {
  width: 110, padding: "8px 10px", borderRadius: 9, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};

// Per-product override → percent string ("" = inherit general).
function overrideToPct(rate: number | null | undefined): string {
  return rate == null ? "" : String(Math.round(rate * 100));
}

export default function PricingTable({ products, config }: { products: PricingProductInput[]; config: PricingConfig }) {
  const router = useRouter();

  // General waste rate — editable + persisted to ops.config.
  const [gWastePct, setGWastePct] = useState(Math.round(config.wasteRate * 100));
  const [gBusy, setGBusy] = useState(false);
  const gFrac = clampFrac(gWastePct);
  const gDirty = Math.round(config.wasteRate * 100) !== Math.round(gWastePct);
  const liveCfg: PricingConfig = { ...config, wasteRate: gFrac };

  // Per-product drafts.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, String(Math.round(p.listPrice))])),
  );
  const [wasteDrafts, setWasteDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, overrideToPct(p.wasteRate)])),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rows = useMemo(
    () =>
      products.map((p) => {
        const draft = Number(priceDrafts[p.id]);
        const candidate = Number.isFinite(draft) && draft > 0 ? draft : p.listPrice;
        const wStr = wasteDrafts[p.id] ?? "";
        const wOverride = wStr === "" ? null : clampFrac(Number(wStr));
        // Compute at the DRAFT waste override (or inherit the live general rate).
        const shown = computeSkuPricing({ ...p, listPrice: candidate, wasteRate: wOverride }, liveCfg);
        const priceDirty = Math.round(candidate) !== Math.round(p.listPrice);
        const savedFrac = p.wasteRate == null ? null : p.wasteRate;
        const wasteDirty = (wOverride == null ? null : Math.round(wOverride * 100)) !== (savedFrac == null ? null : Math.round(savedFrac * 100));
        return { p, shown, candidate, wStr, wOverride, priceDirty, wasteDirty };
      }),
    [products, priceDrafts, wasteDrafts, liveCfg],
  );

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setError(null);
    const res = await fetch("/api/admin/ops/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Update failed."); return false; }
    return true;
  };

  const saveGeneral = async () => {
    setGBusy(true);
    if (await post({ action: "general_waste", generalWasteRate: gWastePct })) router.refresh();
    setGBusy(false);
  };
  const savePrice = async (id: string, price: number) => {
    setBusyId(id);
    if (await post({ productId: id, listPrice: price })) { setSavedId(id); setTimeout(() => setSavedId((s) => (s === id ? null : s)), 2500); router.refresh(); }
    setBusyId(null);
  };
  const saveWaste = async (id: string, wStr: string) => {
    setBusyId(id + "-w");
    if (await post({ action: "product_waste", productId: id, wasteRate: wStr === "" ? null : Number(wStr) })) router.refresh();
    setBusyId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* General settings */}
      <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14, padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, color: "var(--soft)" }}>General waste rate</span>
          <input type="number" min="0" max="95" value={gWastePct} onChange={(e) => setGWastePct(Number(e.target.value))} style={{ ...inputStyle, width: 68 }} />
          <span style={{ color: "var(--soft)" }}>%</span>
          {gDirty && (
            <>
              <button onClick={saveGeneral} disabled={gBusy} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{gBusy ? "Saving…" : "Save default"}</button>
              <button onClick={() => setGWastePct(Math.round(config.wasteRate * 100))} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>reset</button>
            </>
          )}
        </div>
        <div style={{ color: "var(--soft)" }}>Floor <strong style={{ color: "var(--ink)" }}>{formatPct(config.marginFloor)}</strong> · B2B margin <strong style={{ color: "var(--ink)" }}>{formatPct(config.b2bMargin)}</strong></div>
        <div style={{ fontSize: 11.5, color: "var(--soft)" }}>Default applies to every SKU unless it sets its own rate. Effective cost = std cost ÷ (1 − waste).</div>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(({ p, shown, candidate, wStr, wOverride, priceDirty, wasteDirty }) => {
          const open = expanded.has(p.id);
          return (
            <div key={p.id} style={{ background: "#fff", border: `1.5px solid ${shown.belowFloor ? "var(--red)" : "var(--line)"}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                  {p.name} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12 }}>{p.sku}{p.isBundle ? " · bundle" : ""}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 900, padding: "3px 10px", borderRadius: 999, background: shown.belowFloor ? "#fdecec" : "var(--tint-success)", color: shown.belowFloor ? "var(--red)" : "var(--green)" }}>
                  {formatPct(shown.margin)} {shown.belowFloor ? `· below ${formatPct(shown.floor)} floor` : "net margin"}
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginTop: 8, fontSize: 12.5, color: "var(--soft)" }}>
                <span>Std cost <strong style={{ color: "var(--ink)" }}>{rupiah(p.stdCost)}</strong></span>
                <span>Waste <strong style={{ color: "var(--ink)" }}>{formatPct(shown.wasteRate)}</strong>{shown.wasteFromProduct ? " (menu)" : " (general)"}</span>
                <span>Effective <strong style={{ color: "var(--ink)" }}>{rupiah(shown.effCost)}</strong></span>
              </div>

              <button onClick={() => toggle(p.id)} style={{ marginTop: 8, border: "none", background: "transparent", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", padding: 0 }}>
                {open ? "▴ Hide margin calc" : "▾ Show margin calc"}
              </button>

              {open && (
                <div style={{ marginTop: 8, background: "var(--surface2)", border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, fontSize: 12.5, color: "var(--ink)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 800, color: "var(--soft)", fontSize: 11.5, letterSpacing: "0.03em" }}>NET MARGIN — HOW IT&apos;S CALCULATED</div>
                  <Calc label="1. Std cost (from ledger)" value={rupiah(p.stdCost)} />
                  <Calc label={`2. Waste rate (${shown.wasteFromProduct ? "this menu" : "general default"})`} value={formatPct(shown.wasteRate)} />
                  <Calc label="3. Effective cost = std ÷ (1 − waste)" value={`${rupiah(p.stdCost)} ÷ (1 − ${formatPct(shown.wasteRate)}) = ${rupiah(shown.effCost)}`} />
                  <Calc label="4. List price" value={rupiah(candidate)} />
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 6, fontWeight: 800 }}>
                    Net margin = (price − effective) ÷ price = ({rupiah(candidate)} − {rupiah(shown.effCost)}) ÷ {rupiah(candidate)} = <span style={{ color: shown.belowFloor ? "var(--red)" : "var(--green)" }}>{formatPct(shown.margin)}</span>
                  </div>
                  <div style={{ color: "var(--soft)", marginTop: 2 }}>
                    Break-even (floor {formatPct(shown.floor)}) <strong style={{ color: "var(--ink)" }}>{rupiah(shown.floorPrice)}</strong> · B2B price (margin {formatPct(config.b2bMargin)}) <strong style={{ color: "var(--ink)" }}>{rupiah(shown.b2bPrice)}</strong>
                  </div>

                  {/* Per-menu waste override */}
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: "var(--soft)" }}>This menu&apos;s waste rate</span>
                    <input type="number" min="0" max="95" value={wStr} onChange={(e) => setWasteDrafts((d) => ({ ...d, [p.id]: e.target.value }))} placeholder={`${Math.round(config.wasteRate * 100)} (general)`} style={{ ...inputStyle, width: 130 }} />
                    <span style={{ color: "var(--soft)" }}>%</span>
                    <button onClick={() => saveWaste(p.id, wStr)} disabled={!wasteDirty || busyId === p.id + "-w"} style={{ padding: "7px 14px", borderRadius: 999, border: "none", fontWeight: 800, fontSize: 12, cursor: !wasteDirty ? "default" : "pointer", background: !wasteDirty ? "var(--line)" : "var(--choco)", color: !wasteDirty ? "var(--soft)" : "#fff" }}>
                      {busyId === p.id + "-w" ? "Saving…" : "Save waste"}
                    </button>
                    {wOverride != null && (
                      <button onClick={() => { setWasteDrafts((d) => ({ ...d, [p.id]: "" })); saveWaste(p.id, ""); }} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>use general</button>
                    )}
                  </div>
                </div>
              )}

              {shown.b2bPrice > p.listPrice && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--red)", fontWeight: 700 }}>⚠ B2B price exceeds retail — don&apos;t wholesale at this price.</div>
              )}

              {/* List price edit */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)" }}>List price</label>
                <input type="number" inputMode="numeric" min="0" value={priceDrafts[p.id] ?? ""} onChange={(e) => setPriceDrafts((d) => ({ ...d, [p.id]: e.target.value }))} style={inputStyle} />
                <button onClick={() => savePrice(p.id, candidate)} disabled={!priceDirty || busyId === p.id} style={{ padding: "8px 16px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13, cursor: !priceDirty || busyId === p.id ? "default" : "pointer", background: !priceDirty ? "var(--line)" : "var(--choco)", color: !priceDirty ? "var(--soft)" : "#fff" }}>
                  {busyId === p.id ? "Saving…" : priceDirty ? "Save price" : savedId === p.id ? "✓ Saved" : "Saved"}
                </button>
                {priceDirty && (
                  <button onClick={() => setPriceDrafts((d) => ({ ...d, [p.id]: String(Math.round(p.listPrice)) }))} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>cancel</button>
                )}
                <button onClick={() => setPriceDrafts((d) => ({ ...d, [p.id]: String(Math.ceil(shown.floorPrice / 500) * 500) }))} style={{ border: "1.5px dashed var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "6px 10px", borderRadius: 999 }} title="Set the price to just clear the margin floor">
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

function Calc({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ color: "var(--soft)" }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}
