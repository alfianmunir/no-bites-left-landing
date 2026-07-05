/** POST /api/admin/orders/[id]/refund — PAID or in-fulfillment orders. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { canTransition } from "@/lib/orders";
import { refundOrder } from "@/lib/finpay";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  // Refundable while paid but not yet completed (PAID..READY_FOR_PICKUP, or the
  // delivery equivalents). PICKED_UP/DELIVERED and unpaid states are rejected.
  if (!canTransition(order.status, "REFUNDED", order.fulfillment)) {
    return NextResponse.json({ error: `cannot refund an order in ${order.status}` }, { status: 400 });
  }

  const result = await refundOrder(id, order.amount);
  if (!result.ok) {
    logOrder("admin_refund_failed", { orderId: id, raw: result.raw });
    return NextResponse.json({ error: "Finpay refund failed" }, { status: 502 });
  }

  const updated = await store.setStatus(id, "REFUNDED", "admin");
  logOrder("admin_refund", { orderId: id, amount: order.amount });
  return NextResponse.json({ order: updated });
}
