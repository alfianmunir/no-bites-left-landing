/** POST /api/admin/ops/batch/close — finalise a batch (cost + finished goods). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, closeBatch } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { batchId?: string; actualYield?: number | string; laborMinutes?: number | string | null; laborCost?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  const actualYield = Number(body.actualYield);
  const laborCost = Number(body.laborCost);
  const laborMinutes = body.laborMinutes == null || body.laborMinutes === "" ? null : Number(body.laborMinutes);
  if (!batchId) return NextResponse.json({ error: "missing batch" }, { status: 400 });
  if (!Number.isFinite(actualYield) || actualYield <= 0) return NextResponse.json({ error: "enter the actual yield (units produced)" }, { status: 400 });
  if (!Number.isFinite(laborCost) || laborCost < 0) return NextResponse.json({ error: "enter a valid labor cost (0 or more)" }, { status: 400 });
  if (laborMinutes != null && (!Number.isFinite(laborMinutes) || laborMinutes < 0)) return NextResponse.json({ error: "labor minutes must be 0 or more" }, { status: 400 });

  try {
    const costPerUnit = await closeBatch(batchId, actualYield, laborMinutes, laborCost);
    logOrder("ops_batch_close", { batchId, actualYield, laborCost, costPerUnit });
    return NextResponse.json({ ok: true, costPerUnit });
  } catch (e) {
    logOrder("ops_batch_close_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not close the batch — try again." }, { status: 500 });
  }
}
