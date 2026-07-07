/** POST /api/admin/ops/batch/start — open a production batch (consumes BOM). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, startBatch } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { recipeId?: string; plannedQty?: number | string; disposition?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const recipeId = typeof body.recipeId === "string" ? body.recipeId : "";
  const plannedQty = Number(body.plannedQty);
  const disposition = body.disposition === "sample" ? "sample" : "sale";
  if (!recipeId) return NextResponse.json({ error: "select a recipe" }, { status: 400 });
  if (!Number.isFinite(plannedQty) || plannedQty <= 0) return NextResponse.json({ error: "enter a planned quantity greater than 0" }, { status: 400 });

  try {
    const batchId = await startBatch(recipeId, plannedQty, disposition);
    logOrder("ops_batch_start", { batchId, recipeId, plannedQty, disposition });
    return NextResponse.json({ ok: true, batchId });
  } catch (e) {
    logOrder("ops_batch_start_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not start the batch — try again." }, { status: 500 });
  }
}
