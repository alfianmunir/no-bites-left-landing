/** POST /api/admin/ops/batch/start-cycle — open a multi-recipe production cycle
 *  (consumes every line's BOM). Body: { lines: [...], laborCost, laborMinutes }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, startBatchCycle, type BatchLineInput } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

interface RawLine {
  recipeId?: string;
  plannedQty?: number | string;
  qtySample?: number | string;
  qtyKol?: number | string;
  qtyRnd?: number | string;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { lines?: RawLine[]; laborCost?: number | string; laborMinutes?: number | string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) return NextResponse.json({ error: "add at least one recipe" }, { status: 400 });

  const lines: BatchLineInput[] = [];
  for (const raw of rawLines) {
    const recipeId = typeof raw.recipeId === "string" ? raw.recipeId : "";
    const plannedQty = Number(raw.plannedQty);
    const qtySample = Number(raw.qtySample ?? 0);
    const qtyKol = Number(raw.qtyKol ?? 0);
    const qtyRnd = Number(raw.qtyRnd ?? 0);
    if (!recipeId) return NextResponse.json({ error: "each line needs a recipe" }, { status: 400 });
    if (!Number.isFinite(plannedQty) || plannedQty <= 0) return NextResponse.json({ error: "each line needs planned units greater than 0" }, { status: 400 });
    for (const [label, v] of [["sample", qtySample], ["KOL", qtyKol], ["R&D", qtyRnd]] as const) {
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: `${label} units must be 0 or more` }, { status: 400 });
    }
    if (qtySample + qtyKol + qtyRnd > plannedQty) return NextResponse.json({ error: "sample + KOL + R&D cannot exceed planned units" }, { status: 400 });
    lines.push({ recipeId, plannedQty, qtySample, qtyKol, qtyRnd });
  }

  const laborCost = Number(body.laborCost ?? 0);
  const laborMinutes = body.laborMinutes == null || body.laborMinutes === "" ? null : Number(body.laborMinutes);
  if (!Number.isFinite(laborCost) || laborCost < 0) return NextResponse.json({ error: "enter a valid labor cost (0 or more)" }, { status: 400 });
  if (laborMinutes != null && (!Number.isFinite(laborMinutes) || laborMinutes < 0)) return NextResponse.json({ error: "labor minutes must be 0 or more" }, { status: 400 });

  try {
    const batchId = await startBatchCycle(lines, laborCost, laborMinutes);
    logOrder("ops_batch_cycle_start", { batchId, lines: lines.length, laborCost });
    return NextResponse.json({ ok: true, batchId });
  } catch (e) {
    logOrder("ops_batch_cycle_start_failed", { error: String(e) });
    const msg = String(e);
    const friendly = /exceed planned|planned_qty|not found or inactive|at least one/.test(msg)
      ? msg.replace(/^.*?:\s*/, "")
      : "Could not start the batch — try again.";
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
