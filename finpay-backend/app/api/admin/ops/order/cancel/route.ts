/** POST /api/admin/ops/order/cancel — cancel a channel sales order and reverse
 *  its ledger effects (cash, stock, and — for b2b — the invoice). Body:
 *  { orderId }. Idempotent: cancelling an already-cancelled order is a no-op. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, cancelSalesOrder } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "missing order" }, { status: 400 });

  try {
    const res = await cancelSalesOrder(orderId);
    if (!res.ok) {
      const code = res.reason === "not_found" ? 404 : 400;
      const error = res.reason === "already_refunded" ? "order already refunded" : "order not found";
      return NextResponse.json({ error }, { status: code });
    }
    logOrder("ops_order_cancel", { orderId, alreadyCancelled: res.alreadyCancelled ?? false });
    return NextResponse.json({ ok: true, alreadyCancelled: res.alreadyCancelled ?? false });
  } catch (e) {
    logOrder("ops_order_cancel_failed", { orderId, error: String(e) });
    return NextResponse.json({ error: "Could not cancel the order — try again." }, { status: 500 });
  }
}
