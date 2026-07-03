/**
 * Map Finpay's payment-status strings (`result.payment.status` on both the
 * callback and check-status responses) to our OrderStatus lifecycle.
 *
 * The full enum isn't exhaustively documented (PRD §12 open item) — only
 * REQUEST_INITIATED and CAPTURED are confirmed against sandbox/docs so far.
 * Unrecognized values map to "UNKNOWN" so the webhook leaves the order
 * unchanged and logs for manual review, rather than guessing.
 */
import type { OrderStatus } from "./orders";

const PAID = new Set(["CAPTURED", "PAID", "SUCCESS", "SETTLED", "SETTLEMENT"]);
const PENDING = new Set(["REQUEST_INITIATED", "PENDING", "INITIATED", "PROCESSING"]);
const EXPIRED = new Set(["EXPIRED", "EXPIRE", "TIMEOUT"]);
const CANCELLED = new Set([
  "CANCELLED",
  "CANCELED",
  "VOID",
  "VOIDED",
  "FAILED",
  "DECLINED",
  "DENIED",
  "REJECTED",
]);
const REFUNDED = new Set(["REFUNDED", "REFUND"]);

export function mapFinpayStatus(raw: string | null | undefined): OrderStatus | "UNKNOWN" {
  const s = (raw ?? "").trim().toUpperCase();
  if (PAID.has(s)) return "PAID";
  if (PENDING.has(s)) return "PENDING";
  if (EXPIRED.has(s)) return "EXPIRED";
  if (CANCELLED.has(s)) return "CANCELLED";
  if (REFUNDED.has(s)) return "REFUNDED";
  return "UNKNOWN";
}
