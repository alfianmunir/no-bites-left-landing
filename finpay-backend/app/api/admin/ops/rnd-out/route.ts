/** POST /api/admin/ops/rnd-out — outbound raw items consumed in R&D testing.
 *  Deducts stock FEFO at avg cost (tagged ref_type 'rnd_out') and books the
 *  burned made-cost onto the P&L R&D line. No cash-out: the stock was already
 *  paid for on purchase — this reclasses the inventory it consumes into R&D. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, rndTestingOut, listItemsWithStock } from "@/lib/opsStore";
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
  if (!itemId) return NextResponse.json({ error: "select an item" }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "enter a quantity greater than 0" }, { status: 400 });

  try {
    const items = await listItemsWithStock();
    const item = items.find((i) => i.id === itemId);
    if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });

    const cost = await rndTestingOut(itemId, qty, body.note || null);
    logOrder("ops_rnd_out", { itemId, qty, cost });
    return NextResponse.json({ ok: true, cost });
  } catch (e) {
    logOrder("ops_rnd_out_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not record R&D outbound — try again." }, { status: 500 });
  }
}
