/** POST /api/admin/ops/product-opname — post a finished-goods count variance. */
import { NextResponse } from "next/server";
import { isOpsUser } from "@/lib/adminAuth";
import { opsEnabled, postProductOpname } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isOpsUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { productId?: string; countedQty?: number | string; note?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId : "";
  const countedQty = Number(body.countedQty);
  if (!productId) return NextResponse.json({ error: "select a product" }, { status: 400 });
  if (!Number.isFinite(countedQty) || countedQty < 0) return NextResponse.json({ error: "enter a valid counted quantity" }, { status: 400 });

  try {
    const variance = await postProductOpname(productId, countedQty, body.note || null);
    logOrder("ops_product_opname", { productId, countedQty, variance });
    return NextResponse.json({ ok: true, variance });
  } catch (e) {
    logOrder("ops_product_opname_failed", { error: String(e) });
    return NextResponse.json({ error: "Opname failed — try again." }, { status: 500 });
  }
}
