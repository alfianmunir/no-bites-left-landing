/** POST /api/admin/ops/opname — post a stock count variance (Ops Phase 1). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, postOpname } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { itemId?: string; countedQty?: number | string; note?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const countedQty = Number(body.countedQty);
  if (!itemId) return NextResponse.json({ error: "select an item" }, { status: 400 });
  if (!Number.isFinite(countedQty) || countedQty < 0) return NextResponse.json({ error: "enter a valid counted quantity" }, { status: 400 });

  try {
    const variance = await postOpname(itemId, countedQty, body.note || null);
    logOrder("ops_opname", { itemId, countedQty, variance });
    return NextResponse.json({ ok: true, variance });
  } catch (e) {
    logOrder("ops_opname_failed", { error: String(e) });
    return NextResponse.json({ error: "Opname failed — try again." }, { status: 500 });
  }
}
