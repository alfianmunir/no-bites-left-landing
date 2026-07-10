/** POST /api/admin/ops/order/bulk-status — apply a fulfillment and/or payment
 *  status to many orders at once. Body: { orderIds: string[], fulfillmentStatus?, paymentStatus? }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, updateOrdersState, logActivity } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

const STAGE_EN: Record<string, string> = { preparing: "Preparing", packed: "Packed", in_delivery: "In delivery", delivered: "Delivered" };
const STAGE_ID: Record<string, string> = { preparing: "Disiapkan", packed: "Dikemas", in_delivery: "Diantar", delivered: "Terkirim" };

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
    if (updated > 0) {
      const parts: string[] = [];
      const partsId: string[] = [];
      if (patch.fulfillmentStatus) { parts.push(`→ ${STAGE_EN[patch.fulfillmentStatus]}`); partsId.push(`→ ${STAGE_ID[patch.fulfillmentStatus]}`); }
      if (patch.paymentStatus) { parts.push(patch.paymentStatus === "paid" ? "marked paid" : "marked unpaid"); partsId.push(patch.paymentStatus === "paid" ? "ditandai lunas" : "ditandai belum lunas"); }
      await logActivity({
        kind: "order_bulk_status",
        messageEn: `${updated} order(s) ${parts.join(" · ")} in bulk`,
        messageId: `${updated} pesanan ${partsId.join(" · ")} secara massal`,
        tone: "#54300b",
      });
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    logOrder("ops_order_bulk_status_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not update the orders — try again." }, { status: 500 });
  }
}
