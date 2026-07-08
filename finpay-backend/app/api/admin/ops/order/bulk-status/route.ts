/** POST /api/admin/ops/order/bulk-status — apply a fulfillment and/or payment
 *  status to many orders at once. Body: { orderIds: string[], fulfillmentStatus?, paymentStatus? }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, updateOrdersState } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const FULFILLMENT = ["preparing", "packed", "in_delivery", "delivered"];
const PAYMENT = ["unpaid", "paid"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { orderIds?: string[]; fulfillmentStatus?: string; paymentStatus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter((x) => typeof x === "string" && x) : [];
  if (orderIds.length === 0) return NextResponse.json({ error: "select at least one order" }, { status: 400 });

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
    const updated = await updateOrdersState(orderIds, patch);
    logOrder("ops_order_bulk_status", { count: updated, ...patch });
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    logOrder("ops_order_bulk_status_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not update the orders — try again." }, { status: 500 });
  }
}
