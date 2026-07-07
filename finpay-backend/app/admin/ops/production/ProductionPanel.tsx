"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecipeRow, OpenBatchRow, BatchHistoryRow, RequirementRow } from "@/lib/opsStore";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
function qtyFmt(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };

// ---------------------------------------------------------------- Start a batch
function StartBatch({ recipes }: { recipes: RecipeRow[] }) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [disposition, setDisposition] = useState<"sale" | "sample">("sale");
  const [reqs, setReqs] = useState<RequirementRow[] | null>(null);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipe = recipes.find((r) => r.id === recipeId);
  const qtyNum = Number(plannedQty);

  // Default the planned qty to the recipe's standard yield when picked.
  useEffect(() => {
    if (recipe && !plannedQty) setPlannedQty(String(Math.round(recipe.batchYieldQty)));
  }, [recipe, plannedQty]);

  // Live availability check (debounced) whenever recipe or qty changes.
  useEffect(() => {
    if (!recipeId || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      setReqs(null);
      return;
    }
    let cancelled = false;
    setLoadingReqs(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/ops/batch/requirements?recipeId=${encodeURIComponent(recipeId)}&plannedQty=${qtyNum}`);
        const data = await res.json();
        if (!cancelled && res.ok) setReqs(data.requirements as RequirementRow[]);
      } catch {
        /* ignore — availability is advisory */
      } finally {
        if (!cancelled) setLoadingReqs(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [recipeId, qtyNum]);

  const shortItems = (reqs ?? []).filter((r) => r.short > 0);

  const submit = async () => {
    setError(null);
    if (!recipeId) return setError("Select a recipe.");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("Enter a planned quantity.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/batch/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, plannedQty: qtyNum, disposition }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not start the batch.");
      else {
        setPlannedQty("");
        setReqs(null);
        setRecipeId("");
        router.refresh();
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>Start a batch</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Recipe</label>
          <select style={inputStyle} value={recipeId} onChange={(e) => { setRecipeId(e.target.value); setPlannedQty(""); }}>
            <option value="">— select —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.sku}) · yields {qtyFmt(r.batchYieldQty)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Planned units</label>
          <input type="number" inputMode="decimal" min="0" style={inputStyle} value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {(["sale", "sample"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDisposition(d)}
            style={{
              padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer",
              border: `1.5px solid ${disposition === d ? "var(--choco)" : "var(--line)"}`,
              background: disposition === d ? "var(--choco)" : "#fff",
              color: disposition === d ? "#fff" : "var(--soft)",
            }}
          >
            {d === "sale" ? "For sale" : "Sample (R&D/KOL)"}
          </button>
        ))}
      </div>

      {recipe && qtyNum > 0 && (
        <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", marginBottom: 8 }}>
            INGREDIENTS NEEDED {loadingReqs ? "· checking…" : ""}
          </div>
          {reqs && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {reqs.map((r) => (
                <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: r.short > 0 ? "var(--red)" : "var(--ink)" }}>
                  <span>{r.name}</span>
                  <span>
                    {qtyFmt(r.need)} {r.unit} <span style={{ color: "var(--soft)" }}>· have {qtyFmt(r.onHand)}</span>
                    {r.short > 0 && <strong> · short {qtyFmt(r.short)}</strong>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {shortItems.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--red)", fontWeight: 700 }}>
              ⚠ {shortItems.length} item{shortItems.length > 1 ? "s" : ""} short — starting will post negative stock (fix with a Receive or opname).
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Starting…" : "Start batch"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Close a batch
function CloseBatch({ batch }: { batch: OpenBatchRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actualYield, setActualYield] = useState(String(Math.round(batch.plannedQty)));
  const [laborCost, setLaborCost] = useState("");
  const [laborMinutes, setLaborMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const ay = Number(actualYield);
    const lc = Number(laborCost);
    if (!Number.isFinite(ay) || ay <= 0) return setError("Enter the actual yield.");
    if (!Number.isFinite(lc) || lc < 0) return setError("Enter the labor cost (0 or more).");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/batch/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id, actualYield: ay, laborCost: lc, laborMinutes: laborMinutes || null }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not close the batch.");
      else router.refresh();
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm(`Cancel this ${batch.name} batch? Consumed stock will be restored.`)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/batch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not cancel the batch.");
      else router.refresh();
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{batch.name}</span>
          <span style={{ color: "var(--soft)", fontSize: 12.5 }}> · {batch.sku} · planned {qtyFmt(batch.plannedQty)}{batch.disposition === "sample" ? " · sample" : ""}</span>
        </div>
        {!open && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setOpen(true)} style={{ padding: "7px 14px", borderRadius: 10, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
              Close batch
            </button>
            <button onClick={cancel} disabled={busy} style={{ padding: "7px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Actual yield</label>
              <input type="number" inputMode="decimal" min="0" style={inputStyle} value={actualYield} onChange={(e) => setActualYield(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Labor cost (Rp)</label>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="this batch's share" />
            </div>
            <div>
              <label style={labelStyle}>Labor mins (opt)</label>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={laborMinutes} onChange={(e) => setLaborMinutes(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={submit} disabled={busy} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--green)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>
              {busy ? "Closing…" : "Confirm close"}
            </button>
            <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Panel
export default function ProductionPanel({
  recipes,
  openBatches,
  history,
}: {
  recipes: RecipeRow[];
  openBatches: OpenBatchRow[];
  history: BatchHistoryRow[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <StartBatch recipes={recipes} />

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>
          OPEN BATCHES · {openBatches.length}
        </div>
        {openBatches.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5, ...card }}>No batches in progress.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {openBatches.map((b) => (
              <CloseBatch key={b.id} batch={b} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 }}>
          RECENT BATCHES
        </div>
        {history.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5, ...card }}>No closed batches yet.</div>
        ) : (
          <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
              <thead>
                <tr>
                  {["Baked", "Product", "Yield", "Cost/unit"].map((h, i) => (
                    <th key={h} style={{ textAlign: i > 1 ? "right" : "left", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((b) => {
                  const low = b.yieldPct < 0.95;
                  return (
                    <tr key={b.id}>
                      <td style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--soft)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{b.bakedAt || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--ink)", borderBottom: "1px solid var(--line)", fontWeight: 700 }}>
                        {b.name}{b.disposition === "sample" ? <span style={{ color: "var(--soft)", fontWeight: 600 }}> · sample</span> : ""}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", textAlign: "right", whiteSpace: "nowrap", color: low ? "var(--red)" : "var(--ink)" }}>
                        {qtyFmt(b.actualYield)}/{qtyFmt(b.plannedQty)} <span style={{ fontSize: 11.5, fontWeight: 700 }}>({(b.yieldPct * 100).toFixed(0)}%)</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", textAlign: "right", fontWeight: 800 }}>{rupiah(b.costPerUnit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
