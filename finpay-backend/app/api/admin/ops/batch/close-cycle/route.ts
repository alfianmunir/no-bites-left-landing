/** POST /api/admin/ops/batch/close-cycle — finalise a production cycle
 *  (per-line yields → cost + finished goods). Body: { batchId, yields: [...] }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, closeBatchCycle } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

interface RawYield {
  lineId?: string;
  actualYield?: number | string;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { batchId?: string; yields?: RawYield[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  if (!batchId) return NextResponse.json({ error: "missing batch" }, { status: 400 });

  const rawYields = Array.isArray(body.yields) ? body.yields : [];
  if (rawYields.length === 0) return NextResponse.json({ error: "enter the actual yields" }, { status: 400 });

  const yields: { lineId: string; actualYield: number }[] = [];
  for (const raw of rawYields) {
    const lineId = typeof raw.lineId === "string" ? raw.lineId : "";
    const actualYield = Number(raw.actualYield);
    if (!lineId) return NextResponse.json({ error: "missing line" }, { status: 400 });
    if (!Number.isFinite(actualYield) || actualYield <= 0) return NextResponse.json({ error: "each recipe needs an actual yield greater than 0" }, { status: 400 });
    yields.push({ lineId, actualYield });
  }

  try {
    const total = await closeBatchCycle(batchId, yields);
    logOrder("ops_batch_cycle_close", { batchId, lines: yields.length, total });
    return NextResponse.json({ ok: true, total });
  } catch (e) {
    logOrder("ops_batch_cycle_close_failed", { batchId, error: String(e) });
    const msg = String(e);
    const friendly = /every line|actual_yield|already closed|is cancelled|not found/.test(msg)
      ? msg.replace(/^.*?:\s*/, "")
      : "Could not close the batch — try again.";
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
