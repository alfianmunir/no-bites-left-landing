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
import { notifyOpsPaid, notifyCustomerPickupMoved } from "@/lib/notify";
import { isFinal, canTransition, type Order } from "@/lib/orders";
import { getPickupLocationStore } from "@/lib/pickupLocationStore";
import { isValidPickupDate, nextPickupDates } from "@/lib/pickup";
import { logOrder } from "@/lib/log";
import { realizeWebsiteOrderPayment, opsEnabled } from "@/lib/opsStore";

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

/**
 * Payment is async, so the customer's provisional pickup date (picked against
 * checkout-time `now`) may now be too soon once the money actually lands after
 * the same-day cutoff (README §6). Re-check the floor against the PAID event
 * time; if the chosen date is no longer valid, auto-bump to the next valid day,
 * record it in status_history, and email the customer. Best-effort + defensive:
 * never throws, never blocks the webhook ack. Returns the (possibly) updated order.
 */
async function reconcilePickupDate(order: Order, paidAt: Date): Promise<Order> {
  try {
    if (order.fulfillment !== "PICKUP" || !order.pickup_date || !order.pickup_location_id) return order;
    const locStore = getPickupLocationStore();
    await locStore.init();
    const loc = await locStore.get(order.pickup_location_id);
    if (!loc || loc.rule.type === "external") return order; // nothing to validate against
    const settings = await locStore.getSettings();
    const cutoff = settings.sameDayCutoffWib;
    if (isValidPickupDate(loc.rule, order.pickup_date, paidAt, cutoff)) return order; // still fine
    const bumped = nextPickupDates(loc.rule, 1, paidAt, cutoff)[0];
    if (!bumped || bumped === order.pickup_date) return order;
    const store = getStore();
    await store.update(order.id, { pickup_date: bumped });
    // Record the bump on the audit trail via a same-status event note.
    const withNote = await store.setStatus(order.id, "PAID", "reconciliation", `pickup auto-bumped ${order.pickup_date} → ${bumped} (paid after ${cutoff} WIB)`);
    logOrder("pickup_auto_bumped", { orderId: order.id, from: order.pickup_date, to: bumped });
    const updated = withNote ?? { ...order, pickup_date: bumped };
    await notifyCustomerPickupMoved(updated, bumped);
    return updated;
  } catch (e) {
    logOrder("pickup_reconcile_failed", { orderId: order.id, error: String(e) });
    return order;
  }
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

  // finpay_reference is a non-status field — persist it independently of the
  // status transition so the audit trail (setStatus) stays clean.
  const reference = parsed.order?.reference || order.finpay_reference;
  if (reference && reference !== order.finpay_reference) {
    await store.update(orderId, { finpay_reference: reference });
  }

  // Guard the state machine (PRD §7): reject illegal webhook-driven transitions
  // (e.g. REFUNDED on an unpaid order) rather than blindly applying `mapped`.
  if (!canTransition(order.status, mapped, order.fulfillment)) {
    logOrder("callback_illegal_transition", { orderId, from: order.status, to: mapped });
    return ack();
  }

  // Mark PAID (or EXPIRED/CANCELLED/REFUNDED). BAKING is a separate admin step
  // (PRD §5.3) — payment does not auto-advance production.
  const updated = await store.setStatus(orderId, mapped, "webhook");
  logOrder("callback_processed", { orderId, from: order.status, to: mapped });

  if (mapped === "PAID" && updated) {
    // Recompute the pickup floor against the real paid time (may bump the date).
    const reconciled = await reconcilePickupDate(updated, new Date());
    await notifyOpsPaid(reconciled);
    // Realize the finance side of the now-paid native order: sales_lines + COGS,
    // finished-goods draw-down, and net cash-in. setStatus above already flipped
    // payment_status=paid; this adds the ledger effect (idempotent). Non-fatal —
    // log and still ack, never block the webhook (rule §4: always respond once
    // the signature is verified).
    if (opsEnabled) {
      try {
        await realizeWebsiteOrderPayment(orderId);
      } catch (e) {
        logOrder("ops_realize_failed", { orderId, error: String(e) });
      }
    }
  }

  return ack();
}
