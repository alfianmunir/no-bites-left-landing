/** POST /api/admin/ops/batch/cancel — cancel an in-progress batch (reverses consumption). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, cancelBatch } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { batchId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  if (!batchId) return NextResponse.json({ error: "missing batch" }, { status: 400 });

  try {
    const ok = await cancelBatch(batchId);
    if (!ok) return NextResponse.json({ error: "batch not found" }, { status: 404 });
    logOrder("ops_batch_cancel", { batchId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = String(e).includes("only in-progress") ? "Only in-progress batches can be cancelled." : "Cancel failed — try again.";
    logOrder("ops_batch_cancel_failed", { batchId, error: String(e) });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
