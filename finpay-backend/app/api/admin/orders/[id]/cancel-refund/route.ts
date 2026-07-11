/**
 * POST /api/admin/orders/[id]/cancel-refund — cancel a PAID website order with a
 * reason and mark it REFUNDED. The refund money itself is processed OUTSIDE the
 * app (manual bank transfer — we collect the customer's account over WhatsApp),
 * so this does NOT call Finpay. It:
 *   • sets the order REFUNDED,
 *   • reverses its finance (returns stock + reverses the website cash-in) so the
 *     ledger + P&L don't keep a phantom sale,
 *   • emails the customer the reason + that a refund is coming,
 *   • logs the cancellation (with reason) to the activity feed.
 * Body: { reason: string }.
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { canTransition } from "@/lib/orders";
import { notifyCustomerCancelled } from "@/lib/notify";
import { opsEnabled, reverseWebsiteOrderFinance, logActivity } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "a cancellation reason is required" }, { status: 400 });
  if (reason.length > 300) return NextResponse.json({ error: "reason is too long (max 300 chars)" }, { status: 400 });

  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  // Same window as a refund: paid but not yet completed. Unpaid/PENDING orders
  // use the plain cancel; picked-up/already-refunded are rejected.
  if (!canTransition(order.status, "REFUNDED", order.fulfillment)) {
    return NextResponse.json({ error: `cannot cancel an order in ${order.status}` }, { status: 400 });
  }

  const updated = await store.setStatus(id, "REFUNDED", "admin", reason);

  // Reverse the finance side (returns stock, reverses the website cash-in) so the
  // ledger + P&L drop the sale. Idempotent; guarded so a hiccup never blocks the
  // cancellation the customer is being told about.
  if (opsEnabled) {
    try {
      await reverseWebsiteOrderFinance(id);
    } catch (e) {
      logOrder("admin_cancel_refund_reverse_failed", { orderId: id, error: String(e) });
    }
  }

  // Email the customer (best-effort — never blocks the cancellation).
  try {
    await notifyCustomerCancelled(order, reason);
  } catch (e) {
    logOrder("admin_cancel_refund_email_failed", { orderId: id, error: String(e) });
  }

  await logActivity({
    kind: "website_cancel_refund",
    messageEn: `Website ${id} cancelled + refund (manual) — ${reason}`,
    messageId: `Situs ${id} dibatalkan + refund (manual) — ${reason}`,
    tone: "#e24026",
  });
  logOrder("admin_cancel_refund", { orderId: id, amount: order.amount, reason });

  return NextResponse.json({ order: updated });
}
