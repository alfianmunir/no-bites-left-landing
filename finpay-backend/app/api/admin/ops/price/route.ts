/** POST /api/admin/ops/price — adjust a product's list price (Ops pricing). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, updateProductPrice } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { productId?: string; listPrice?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId : "";
  const listPrice = Number(body.listPrice);
  if (!productId) return NextResponse.json({ error: "select a product" }, { status: 400 });
  if (!Number.isFinite(listPrice) || listPrice <= 0) return NextResponse.json({ error: "enter a valid price" }, { status: 400 });

  try {
    const updated = await updateProductPrice(productId, listPrice);
    if (!updated) return NextResponse.json({ error: "product not found" }, { status: 404 });
    logOrder("ops_price_update", { productId, listPrice });
    return NextResponse.json({ ok: true, product: updated });
  } catch (e) {
    logOrder("ops_price_update_failed", { error: String(e) });
    return NextResponse.json({ error: "Price update failed — try again." }, { status: 500 });
  }
}
