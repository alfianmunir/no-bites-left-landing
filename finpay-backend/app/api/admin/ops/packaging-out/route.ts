/** POST /api/admin/ops/packaging-out — record packaging leaving stock (bundle packing). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, packagingOut, listItemsWithStock } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { itemId?: string; qty?: number | string; note?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const qty = Number(body.qty);
  if (!itemId) return NextResponse.json({ error: "select a packaging item" }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "enter a quantity greater than 0" }, { status: 400 });

  try {
    // Guard: only packaging-type items may go out this way.
    const items = await listItemsWithStock();
    const item = items.find((i) => i.id === itemId);
    if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });
    if (item.type !== "packaging") return NextResponse.json({ error: "only packaging items can be logged as packaging out" }, { status: 400 });

    const cost = await packagingOut(itemId, qty, body.note || null);
    logOrder("ops_packaging_out", { itemId, qty, cost });
    return NextResponse.json({ ok: true, cost });
  } catch (e) {
    logOrder("ops_packaging_out_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not record packaging out — try again." }, { status: 500 });
  }
}
