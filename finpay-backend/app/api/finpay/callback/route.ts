/**
 * POST /api/finpay/callback — Finpay webhook receiver (PRD §6, highest-risk phase).
 *
 * Confirmed payload shape (hub.finpay.id/docs/finpay-pg/after-payment/notification-callback):
 *   { customer: { id }, order: { id, reference, amount, currency }, card: {...},
 *     meta: {...}, result: { payment: { amount, status, statusDesc } }, signature }
 *
 * Rules (PRD §6/§13, do not deviate):
 *   1. Verify signature over the RAW body minus "signature" (string surgery, not
 *      parse→re-encode) — see lib/finpay.ts stripSignatureField/verifyCallbackSignature.
 *   2. Defense in depth: cross-check via Check Status; only act if statuses agree.
 *   3. Idempotent on final states AND on no-op transitions (duplicate callbacks).
 *   4. Always respond {"responseCode":"2000000"} once the signature is verified,
 *      whether or not we acted on it — Finpay will retry otherwise.
 *   5. Only "verified" callbacks are appended to callback_log (schema.sql comment).
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { verifyCallbackSignature, checkStatus } from "@/lib/finpay";
import { mapFinpayStatus } from "@/lib/finpayStatus";
import { notifyOpsPaid } from "@/lib/notify";
import { isFinal } from "@/lib/orders";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FinpayCallbackBody {
  customer?: { id?: string };
  order?: { id?: string; reference?: string; amount?: number; currency?: string };
  result?: { payment?: { amount?: number; status?: string; statusDesc?: string | null } };
  signature?: string;
}

function ack(): NextResponse {
  return NextResponse.json({ responseCode: "2000000" }, { status: 200 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();

  let parsed: FinpayCallbackBody;
  try {
    parsed = JSON.parse(rawBody) as FinpayCallbackBody;
  } catch {
    logOrder("callback_invalid_json", { rawBodyLength: rawBody.length });
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const orderId = parsed.order?.id;
  if (!orderId) {
    logOrder("callback_missing_order_id", {});
    return NextResponse.json({ error: "missing order.id" }, { status: 400 });
  }

  const signature = typeof parsed.signature === "string" ? parsed.signature : "";
  if (!verifyCallbackSignature(rawBody, signature)) {
    logOrder("callback_signature_invalid", { orderId });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const store = getStore();
  await store.init();
  const order = await store.get(orderId);

  if (!order) {
    // Signed, but for an order we don't have. Ack anyway so Finpay stops
    // retrying; the mismatch is logged for manual review.
    logOrder("callback_unknown_order", { orderId });
    return ack();
  }

  // Only verified callbacks are recorded (schema.sql: "append raw verified callbacks").
  await store.appendCallback(orderId, { receivedAt: new Date().toISOString(), body: parsed });

  if (isFinal(order.status)) {
    logOrder("callback_ignored_final", { orderId, status: order.status });
    return ack();
  }

  const callbackStatus = parsed.result?.payment?.status ?? null;
  const mapped = mapFinpayStatus(callbackStatus);

  if (mapped === "UNKNOWN") {
    logOrder("callback_unknown_status", { orderId, callbackStatus });
    return ack();
  }

  if (mapped === order.status) {
    // Duplicate callback for a status we've already recorded — no-op,
    // notably prevents double ops-notification on a repeated PAID callback.
    logOrder("callback_noop_duplicate", { orderId, status: order.status });
    return ack();
  }

  // Defense in depth (PRD §6, Finpay-recommended): cross-check via Check
  // Status and only act if the two sources agree.
  const checked = await checkStatus(orderId);
  const checkedMapped = mapFinpayStatus(checked.paymentStatus);

  if (!checked.ok || checkedMapped !== mapped) {
    logOrder("callback_check_status_mismatch", {
      orderId,
      callbackStatus,
      mapped,
      checkStatusOk: checked.ok,
      checkStatusValue: checked.paymentStatus,
      checkedMapped,
    });
    return ack();
  }

  if (mapped === "PAID") {
    const reportedAmount = parsed.order?.amount ?? checked.orderAmount;
    if (reportedAmount != null && reportedAmount !== order.amount) {
      logOrder("callback_amount_mismatch", { orderId, expected: order.amount, got: reportedAmount });
      return ack();
    }
  }

  const updated = await store.update(orderId, {
    status: mapped,
    finpay_reference: parsed.order?.reference || order.finpay_reference,
    // Small ops team bakes immediately on payment — start the fulfillment
    // timeline right away rather than requiring a separate admin click.
    ...(mapped === "PAID" ? { fulfillment_stage: "baking" as const } : {}),
  });

  logOrder("callback_processed", { orderId, from: order.status, to: mapped });

  if (mapped === "PAID" && updated) {
    await notifyOpsPaid(updated);
  }

  return ack();
}
