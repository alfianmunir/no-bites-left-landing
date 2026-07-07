/** POST /api/admin/ops/waste — record ingredient or finished-goods waste (Ops Phase 1). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, postWaste, postProductWaste } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { kind?: string; itemId?: string; productId?: string; qty?: number | string; note?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const qty = Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "enter a quantity greater than 0" }, { status: 400 });

  try {
    if (body.kind === "product") {
      const productId = typeof body.productId === "string" ? body.productId : "";
      if (!productId) return NextResponse.json({ error: "select a product" }, { status: 400 });
      await postProductWaste(productId, qty, body.note || null);
      logOrder("ops_waste_product", { productId, qty });
      return NextResponse.json({ ok: true });
    }
    // default: ingredient/packaging waste
    const itemId = typeof body.itemId === "string" ? body.itemId : "";
    if (!itemId) return NextResponse.json({ error: "select an item" }, { status: 400 });
    const cost = await postWaste(itemId, qty, body.note || null);
    logOrder("ops_waste_item", { itemId, qty, cost });
    return NextResponse.json({ ok: true, cost });
  } catch (e) {
    logOrder("ops_waste_failed", { error: String(e) });
    return NextResponse.json({ error: "Waste entry failed — try again." }, { status: 500 });
  }
}
