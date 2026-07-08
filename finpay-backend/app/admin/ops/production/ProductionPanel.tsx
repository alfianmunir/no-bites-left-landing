"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsRole } from "@/lib/adminAuth";
import type {
  RecipeRow,
  OpenBatchRow,
  BatchHistoryRow,
  RequirementRow,
  OpenBatchCycleRow,
  BatchCycleHistoryRow,
  BatchLineRow,
} from "@/lib/opsStore";

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
const sectionLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 };

// Allocation tags carved out of a confirmed recipe's units. "sale" is implicit
// (the remainder); these three are entered explicitly and don't become sellable
// stock — their cost is carried by the batch (reclassified to marketing / R&D).
const TAGS = [
  { key: "qtySample", label: "Sample", color: "var(--orange)" },
  { key: "qtyKol", label: "KOL", color: "var(--blue)" },
  { key: "qtyRnd", label: "R&D", color: "var(--green)" },
] as const;

interface DraftLine {
  key: string;
  recipeId: string;
  recipeName: string;
  sku: string;
  plannedQty: number;
  qtySample: number;
  qtyKol: number;
  qtyRnd: number;
  shortCount: number; // ingredients short at confirm time (advisory)
}

function carveOut(l: { qtySample: number; qtyKol: number; qtyRnd: number }): number {
  return l.qtySample + l.qtyKol + l.qtyRnd;
}

function TagPills({ line }: { line: { plannedQty?: number; qtySample: number; qtyKol: number; qtyRnd: number } }) {
  const pills: { label: string; qty: number; color: string }[] = [];
  const carve = carveOut(line);
  if (line.plannedQty != null) {
    const sale = line.plannedQty - carve;
    if (sale > 0) pills.push({ label: "For sale", qty: sale, color: "var(--choco)" });
  }
  for (const t of TAGS) {
    const qty = line[t.key];
    if (qty > 0) pills.push({ label: t.label, qty, color: t.color });
  }
  if (pills.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {pills.map((p) => (
        <span key={p.label} style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: p.color, borderRadius: 999, padding: "2px 9px" }}>
          {p.label} {qtyFmt(p.qty)}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------ Add a recipe to the draft
function RecipeDraftForm({ recipes, onAdd }: { recipes: RecipeRow[]; onAdd: (l: DraftLine) => void }) {
  const [recipeId, setRecipeId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [sample, setSample] = useState("");
  const [kol, setKol] = useState("");
  const [rnd, setRnd] = useState("");
  const [reqs, setReqs] = useState<RequirementRow[] | null>(null);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipe = recipes.find((r) => r.id === recipeId);
  const qtyNum = Number(plannedQty);
  const carve = (Number(sample) || 0) + (Number(kol) || 0) + (Number(rnd) || 0);
  const saleQty = Number.isFinite(qtyNum) ? qtyNum - carve : 0;

  useEffect(() => {
    if (recipe && !plannedQty) setPlannedQty(String(Math.round(recipe.batchYieldQty)));
  }, [recipe, plannedQty]);

  // Live availability check (debounced) — advisory, mirrors the pre-start check.
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
        /* availability is advisory */
      } finally {
        if (!cancelled) setLoadingReqs(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [recipeId, qtyNum]);

  const shortItems = (reqs ?? []).filter((r) => r.short > 0);

  const reset = () => {
    setRecipeId(""); setPlannedQty(""); setSample(""); setKol(""); setRnd(""); setReqs(null); setError(null);
  };

  const confirm = () => {
    setError(null);
    if (!recipe) return setError("Select a recipe.");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("Enter planned units.");
    if (carve > qtyNum) return setError("Sample + KOL + R&D can't exceed planned units.");
    onAdd({
      key: crypto.randomUUID(),
      recipeId: recipe.id,
      recipeName: recipe.name,
      sku: recipe.sku,
      plannedQty: qtyNum,
      qtySample: Number(sample) || 0,
      qtyKol: Number(kol) || 0,
      qtyRnd: Number(rnd) || 0,
      shortCount: shortItems.length,
    });
    reset();
  };

  return (
    <div style={{ border: "1.5px dashed var(--line)", borderRadius: 12, padding: 14, background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--choco)" }}>Add a recipe</div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,0.7fr)", gap: 10 }}>
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

      {/* Allocation — carve part of the planned units out to sample / KOL / R&D. */}
      {recipe && qtyNum > 0 && (
        <div>
          <label style={labelStyle}>Allocate units (optional) · rest sold</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
            {([["Sample", sample, setSample], ["KOL", kol, setKol], ["R&D", rnd, setRnd]] as const).map(([lbl, val, set]) => (
              <div key={lbl}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--soft)", marginBottom: 3 }}>{lbl}</div>
                <input type="number" inputMode="decimal" min="0" style={{ ...inputStyle, padding: "8px 10px" }} value={val} onChange={(e) => set(e.target.value)} placeholder="0" />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <TagPills line={{ plannedQty: qtyNum, qtySample: Number(sample) || 0, qtyKol: Number(kol) || 0, qtyRnd: Number(rnd) || 0 }} />
          </div>
          {saleQty < 0 && <div style={{ marginTop: 6, fontSize: 12, color: "var(--red)", fontWeight: 700 }}>Allocation exceeds planned units.</div>}
        </div>
      )}

      {/* Availability check */}
      {recipe && qtyNum > 0 && (
        <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "#fff" }}>
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
              ⚠ {shortItems.length} item{shortItems.length > 1 ? "s" : ""} short — starting will post negative stock.
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <button
        onClick={confirm}
        disabled={!recipe || !(qtyNum > 0) || saleQty < 0}
        style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 10, border: "1.5px solid var(--choco)", background: !recipe || !(qtyNum > 0) || saleQty < 0 ? "var(--surface2)" : "var(--choco)", color: !recipe || !(qtyNum > 0) || saleQty < 0 ? "var(--soft)" : "#fff", fontWeight: 800, fontSize: 13.5, cursor: !recipe || !(qtyNum > 0) || saleQty < 0 ? "default" : "pointer" }}
      >
        + Confirm recipe
      </button>
    </div>
  );
}

// ------------------------------------------------ Build a batch (the cycle)
function BatchBuilder({ recipes, role }: { recipes: RecipeRow[]; role: OpsRole }) {
  const router = useRouter();
  const isStaff = role === "staff";
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [laborCost, setLaborCost] = useState("");
  const [laborMinutes, setLaborMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLine = useCallback((l: DraftLine) => setLines((prev) => [...prev, l]), []);
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const totalPlanned = lines.reduce((s, l) => s + l.plannedQty, 0);
  const anyShort = lines.some((l) => l.shortCount > 0);

  const start = async () => {
    setError(null);
    if (lines.length === 0) return setError("Add at least one recipe first.");
    // Staff never send labor — the super-admin adds it when closing.
    let lc: number | null = null;
    if (!isStaff) {
      lc = Number(laborCost || 0);
      if (!Number.isFinite(lc) || lc < 0) return setError("Enter a valid labor cost (0 or more).");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/batch/start-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ recipeId: l.recipeId, plannedQty: l.plannedQty, qtySample: l.qtySample, qtyKol: l.qtyKol, qtyRnd: l.qtyRnd })),
          laborCost: lc,
          laborMinutes: laborMinutes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not start the batch.");
      else {
        setLines([]); setLaborCost(""); setLaborMinutes("");
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>New production batch</div>
        {lines.length > 0 && <div style={{ fontSize: 12, color: "var(--soft)", fontWeight: 700 }}>{lines.length} recipe{lines.length > 1 ? "s" : ""} · {qtyFmt(totalPlanned)} units planned</div>}
      </div>

      {/* Confirmed draft lines */}
      {lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.map((l, i) => (
            <div key={l.key} style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>
                  <span style={{ color: "var(--soft)", fontWeight: 700 }}>{i + 1}. </span>{l.recipeName}
                  <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12.5 }}> · {qtyFmt(l.plannedQty)} units</span>
                </div>
                <button onClick={() => removeLine(l.key)} style={{ border: "none", background: "transparent", color: "var(--red)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", padding: 2 }}>Remove</button>
              </div>
              <TagPills line={l} />
              {l.shortCount > 0 && <div style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 700 }}>⚠ {l.shortCount} ingredient{l.shortCount > 1 ? "s" : ""} short at confirm</div>}
            </div>
          ))}
        </div>
      )}

      <RecipeDraftForm recipes={recipes} onAdd={addLine} />

      {/* Labor (once for the whole cycle) + start. Staff don't set labor — the
          super-admin enters it when closing the batch. */}
      {lines.length > 0 && (
        <>
          {!isStaff && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Labor cost — whole batch (Rp)</label>
                <input type="number" inputMode="numeric" min="0" style={inputStyle} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="split across recipes" />
              </div>
              <div>
                <label style={labelStyle}>Labor mins (opt)</label>
                <input type="number" inputMode="numeric" min="0" style={inputStyle} value={laborMinutes} onChange={(e) => setLaborMinutes(e.target.value)} />
              </div>
            </div>
          )}
          {isStaff && <div style={{ fontSize: 12, color: "var(--soft)", fontWeight: 600 }}>Labor cost is added by the admin when the batch is closed.</div>}
          {anyShort && <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>⚠ Some recipes were short on stock — starting will post negative balances (fix with a Receive or opname).</div>}
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <button onClick={start} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Starting…" : `Start batch · ${lines.length} recipe${lines.length > 1 ? "s" : ""}`}
          </button>
        </>
      )}
      {lines.length === 0 && error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

// ------------------------------------------------ Close a cycle (per-line yields)
// Super-admin only. When the batch was opened without labor (staff-started),
// the close form asks for it — that's the "1 more input" for Heral's batches.
function CloseCycle({ batch }: { batch: OpenBatchCycleRow }) {
  const router = useRouter();
  const needsLabor = batch.laborCost == null;
  const [open, setOpen] = useState(false);
  const [laborCost, setLaborCost] = useState("");
  const [yields, setYields] = useState<Record<string, string>>(() =>
    Object.fromEntries(batch.lines.map((l) => [l.id, String(Math.round(l.plannedQty))])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const payload = batch.lines.map((l) => ({ lineId: l.id, actualYield: Number(yields[l.id]) }));
    if (payload.some((y) => !Number.isFinite(y.actualYield) || y.actualYield <= 0)) return setError("Enter an actual yield for every recipe.");
    let lc: number | null = null;
    if (needsLabor) {
      lc = Number(laborCost || 0);
      if (!Number.isFinite(lc) || lc < 0) return setError("Enter the labor cost (0 or more).");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/batch/close-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id, yields: payload, laborCost: lc }),
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
    if (!confirm("Cancel this batch? Consumed stock will be restored.")) return;
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
        <div style={{ fontWeight: 800, fontSize: 14 }}>
          Batch · {batch.lines.length} recipe{batch.lines.length > 1 ? "s" : ""}
          <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12.5 }}>
            {batch.startedByName ? ` · started by ${batch.startedByName}` : ""}
            {needsLabor ? " · labor to enter" : ` · labor ${rupiah(batch.laborCost as number)}`}
          </span>
        </div>
        {!open && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setOpen(true)} style={{ padding: "7px 14px", borderRadius: 10, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Bake &amp; close</button>
            <button onClick={cancel} disabled={busy} style={{ padding: "7px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Line summary */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {batch.lines.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12 }}>· planned {qtyFmt(l.plannedQty)}</span></div>
              <div style={{ marginTop: 3 }}><TagPills line={l} /></div>
            </div>
            {open && (
              <div style={{ width: 120 }}>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Actual yield</label>
                <input type="number" inputMode="decimal" min="0" style={{ ...inputStyle, padding: "8px 10px" }} value={yields[l.id] ?? ""} onChange={(e) => setYields((y) => ({ ...y, [l.id]: e.target.value }))} />
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {needsLabor && (
            <div style={{ maxWidth: 260 }}>
              <label style={labelStyle}>Labor cost — whole batch (Rp)</label>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="split across recipes" />
            </div>
          )}
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={submit} disabled={busy} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--green)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>{busy ? "Closing…" : "Confirm close"}</button>
            <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>cancel</button>
          </div>
        </div>
      )}
      {!open && error && <div style={{ marginTop: 8, color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

// A staff member's read-only view of an open batch (no close/cancel, no cost).
function StaffOpenCycle({ batch }: { batch: OpenBatchCycleRow }) {
  return (
    <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)" }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
        Batch · {batch.lines.length} recipe{batch.lines.length > 1 ? "s" : ""}
        <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12.5 }}> · in progress</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {batch.lines.map((l) => (
          <div key={l.id}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 12 }}>· planned {qtyFmt(l.plannedQty)}</span></div>
            <div style={{ marginTop: 3 }}><TagPills line={l} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------ Legacy single-recipe close
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
            <button onClick={() => setOpen(true)} style={{ padding: "7px 14px", borderRadius: 10, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Close batch</button>
            <button onClick={cancel} disabled={busy} style={{ padding: "7px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
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
            <button onClick={submit} disabled={busy} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--green)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>{busy ? "Closing…" : "Confirm close"}</button>
            <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------ Closed cycle card (history)
function CycleHistoryCard({ batch }: { batch: BatchCycleHistoryRow }) {
  const totalUnits = batch.lines.reduce((s, l) => s + (l.actualYield ?? 0), 0);
  return (
    <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)" }}>{batch.bakedAt || "—"}</div>
        <div style={{ fontSize: 12, color: "var(--soft)", fontWeight: 700 }}>{qtyFmt(totalUnits)} units · labor {rupiah(batch.laborCost)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {batch.lines.map((l: BatchLineRow) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 6 }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name}</div>
              <div style={{ marginTop: 3 }}><TagPills line={l} /></div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--soft)" }}>yield </span>{qtyFmt(l.actualYield ?? 0)}/{qtyFmt(l.plannedQty)}
              {l.costPerUnit != null && <span style={{ fontWeight: 800 }}> · {rupiah(l.costPerUnit)}/unit</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------ Panel
export default function ProductionPanel({
  role = "super_admin",
  recipes,
  openBatches,
  history,
  openCycles,
  cycleHistory,
}: {
  role?: OpsRole;
  recipes: RecipeRow[];
  openBatches: OpenBatchRow[];
  history: BatchHistoryRow[];
  openCycles: OpenBatchCycleRow[];
  cycleHistory: BatchCycleHistoryRow[];
}) {
  const isStaff = role === "staff";
  const openCount = openBatches.length + openCycles.length;

  // Staff: build a batch + watch open ones (read-only). No close/cancel, no
  // cost history, no legacy super-admin batches.
  if (isStaff) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <BatchBuilder recipes={recipes} role={role} />
        <div>
          <div style={sectionLabel}>OPEN BATCHES · {openCycles.length}</div>
          {openCycles.length === 0 ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5, ...card }}>No batches in progress.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {openCycles.map((b) => <StaffOpenCycle key={b.id} batch={b} />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <BatchBuilder recipes={recipes} role={role} />

      <div>
        <div style={sectionLabel}>OPEN BATCHES · {openCount}</div>
        {openCount === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5, ...card }}>No batches in progress.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {openCycles.map((b) => <CloseCycle key={b.id} batch={b} />)}
            {openBatches.map((b) => <CloseBatch key={b.id} batch={b} />)}
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabel}>RECENT BATCHES</div>
        {cycleHistory.length === 0 && history.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5, ...card }}>No closed batches yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cycleHistory.map((b) => <CycleHistoryCard key={b.id} batch={b} />)}
            {history.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
