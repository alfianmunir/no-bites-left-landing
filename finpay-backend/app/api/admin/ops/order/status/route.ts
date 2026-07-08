/** POST /api/admin/ops/order/status — advance an order's fulfillment stage
 *  and/or toggle its payment status. Body: { orderId, fulfillmentStatus?, paymentStatus? }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, updateOrderState } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const FULFILLMENT = ["preparing", "packed", "in_delivery", "delivered"];
const PAYMENT = ["unpaid", "paid"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { orderId?: string; fulfillmentStatus?: string; paymentStatus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "missing order" }, { status: 400 });

  const patch: { fulfillmentStatus?: string; paymentStatus?: string } = {};
  if (body.fulfillmentStatus != null) {
    if (!FULFILLMENT.includes(body.fulfillmentStatus)) return NextResponse.json({ error: "invalid fulfillment status" }, { status: 400 });
    patch.fulfillmentStatus = body.fulfillmentStatus;
  }
  if (body.paymentStatus != null) {
    if (!PAYMENT.includes(body.paymentStatus)) return NextResponse.json({ error: "invalid payment status" }, { status: 400 });
    patch.paymentStatus = body.paymentStatus;
  }
  if (!patch.fulfillmentStatus && !patch.paymentStatus) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  try {
    const ok = await updateOrderState(orderId, patch);
    if (!ok) return NextResponse.json({ error: "order not found" }, { status: 404 });
    logOrder("ops_order_status", { orderId, ...patch });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logOrder("ops_order_status_failed", { orderId, error: String(e) });
    return NextResponse.json({ error: "Could not update the order — try again." }, { status: 500 });
  }
}
