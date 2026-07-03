/** POST /api/admin/orders/[id]/advance — baking → out_for_delivery → delivered. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.status !== "PAID") return NextResponse.json({ error: "order is not PAID" }, { status: 400 });

  const stage = order.fulfillment_stage ?? "baking";
  if (stage === "baking") {
    const updated = await store.update(id, { fulfillment_stage: "out_for_delivery" });
    logOrder("admin_advance", { orderId: id, to: "out_for_delivery" });
    return NextResponse.json({ order: updated });
  }
  if (stage === "out_for_delivery") {
    const updated = await store.update(id, { status: "FULFILLED", fulfillment_stage: "delivered" });
    logOrder("admin_advance", { orderId: id, to: "delivered" });
    return NextResponse.json({ order: updated });
  }
  return NextResponse.json({ error: "already delivered" }, { status: 400 });
}
