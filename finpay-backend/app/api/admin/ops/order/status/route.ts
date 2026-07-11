/** POST /api/admin/ops/order/status — advance an order's fulfillment stage
 *  and/or toggle its payment status. Body: { orderId, fulfillmentStatus?, paymentStatus? }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, updateOrderState, logActivity } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const FULFILLMENT = ["preparing", "packed", "in_delivery", "delivered"];
const PAYMENT = ["unpaid", "paid"];

const STAGE: Record<string, { en: string; id: string; tone: string }> = {
  preparing: { en: "Preparing", id: "Disiapkan", tone: "#f58c21" },
  packed: { en: "Packed", id: "Dikemas", tone: "#3b9fd6" },
  in_delivery: { en: "In delivery", id: "Diantar", tone: "#54300b" },
  delivered: { en: "Delivered", id: "Terkirim", tone: "#2d9322" },
};

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
    const ref = `#${orderId.slice(0, 6)}`;
    if (patch.fulfillmentStatus) {
      const s = STAGE[patch.fulfillmentStatus];
      await logActivity({ kind: "order_status", messageEn: `Order ${ref} → ${s.en}`, messageId: `Pesanan ${ref} → ${s.id}`, tone: s.tone });
    }
    if (patch.paymentStatus) {
      const paid = patch.paymentStatus === "paid";
      await logActivity({ kind: "order_payment", messageEn: `Order ${ref} marked ${paid ? "paid" : "unpaid"}`, messageId: `Pesanan ${ref} ditandai ${paid ? "lunas" : "belum lunas"}`, tone: paid ? "#2d9322" : "#e24026" });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logOrder("ops_order_status_failed", { orderId, error: String(e) });
    return NextResponse.json({ error: "Could not update the order — try again." }, { status: 500 });
  }
}
