/** POST /api/admin/orders/[id]/cancel — unpaid orders only (Finpay cancel is for pending payments). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { cancelOrder } from "@/lib/finpay";
import { opsEnabled, reverseWebsiteOrderFinance, logActivity } from "@/lib/opsStore";
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
    logOrder("admin_cancel_failed", { orderId: id, responseCode: result.responseCode, responseMessage: result.responseMessage, raw: result.raw });
    const detail = result.responseMessage ?? "unknown error";
    return NextResponse.json({ error: `Finpay cancel failed: ${detail}`, responseCode: result.responseCode }, { status: 502 });
  }

  const updated = await store.setStatus(id, "CANCELLED", "admin");
  // A PENDING order was never realized, so there's normally nothing to reverse —
  // but call the (idempotent, no-op-when-empty) reversal defensively in case the
  // order carried any posted finance. Guarded so it never fails the cancel.
  if (opsEnabled) {
    try {
      await reverseWebsiteOrderFinance(id);
    } catch (e) {
      logOrder("admin_cancel_reverse_failed", { orderId: id, error: String(e) });
    }
  }
  logOrder("admin_cancel", { orderId: id });
  await logActivity({
    kind: "website_cancel",
    messageEn: `Website ${id} cancelled (Finpay)`,
    messageId: `Situs ${id} dibatalkan (Finpay)`,
    tone: "#e24026",
  });
  return NextResponse.json({ order: updated });
}
