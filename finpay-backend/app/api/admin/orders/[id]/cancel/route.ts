/** POST /api/admin/orders/[id]/cancel — unpaid orders only (Finpay cancel is for pending payments). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { cancelOrder } from "@/lib/finpay";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.status !== "PENDING") return NextResponse.json({ error: "only PENDING orders can be cancelled this way" }, { status: 400 });

  const result = await cancelOrder(id);
  if (!result.ok) {
    logOrder("admin_cancel_failed", { orderId: id, raw: result.raw });
    return NextResponse.json({ error: "Finpay cancel failed" }, { status: 502 });
  }

  const updated = await store.update(id, { status: "CANCELLED" });
  logOrder("admin_cancel", { orderId: id });
  return NextResponse.json({ order: updated });
}
