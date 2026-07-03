/**
 * Phase 2 unit checks: status mapping, and signature verification against the
 * REAL callback payload shape confirmed from Finpay's docs (customer/order/
 * card/meta/result/signature — see lib/finpay.ts and the callback route).
 * These don't require a running server; `npm run test:phase2:integration`
 * covers the live route.
 *
 * Usage: npm run test:phase2
 */
import { computeSignature, stripSignatureField, verifyCallbackSignature } from "../lib/finpay";
import { mapFinpayStatus } from "../lib/finpayStatus";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${detail ? " — " + detail : ""}`);
}

console.log("=== Phase 2 unit checks ===");

// --- status mapping ---
console.log("\nFinpay status → OrderStatus mapping:");
check("CAPTURED -> PAID", mapFinpayStatus("CAPTURED") === "PAID");
check("REQUEST_INITIATED -> PENDING", mapFinpayStatus("REQUEST_INITIATED") === "PENDING");
check("EXPIRED -> EXPIRED", mapFinpayStatus("EXPIRED") === "EXPIRED");
check("CANCELLED -> CANCELLED", mapFinpayStatus("CANCELLED") === "CANCELLED");
check("FAILED -> CANCELLED", mapFinpayStatus("FAILED") === "CANCELLED");
check("REFUNDED -> REFUNDED", mapFinpayStatus("REFUNDED") === "REFUNDED");
check("lowercase captured -> PAID", mapFinpayStatus("captured") === "PAID");
check("unrecognized -> UNKNOWN", mapFinpayStatus("SOME_NEW_STATUS") === "UNKNOWN");
check("null -> UNKNOWN", mapFinpayStatus(null) === "UNKNOWN");

// --- callback payload shape (confirmed via Finpay docs, matches PHASE0's guess) ---
console.log("\nCallback signature over the real confirmed payload shape:");
const key = process.env.FINPAY_MERCHANT_KEY ?? "testkey";
const fields = {
  customer: { id: "CUST-1" },
  order: { id: "NBL-X-ABCD", reference: "REF-1", amount: 35000, currency: "IDR" },
  card: { mask: "", info: {} },
  meta: { data: null },
  result: { payment: { amount: 35000, status: "CAPTURED", statusDesc: null } },
};
const canonical = JSON.stringify(fields);
const sig = computeSignature(canonical, key);
const rawBody = canonical.slice(0, -1) + `,"signature":"${sig}"}`;

check("strip returns pre-signature body", stripSignatureField(rawBody) === canonical);
if (process.env.FINPAY_MERCHANT_KEY) {
  check("verifyCallbackSignature() accepts genuine", verifyCallbackSignature(rawBody, sig));
  const tampered = rawBody.replace('"amount":35000', '"amount":1');
  check("verifyCallbackSignature() rejects tampered amount", !verifyCallbackSignature(tampered, sig));
  const tamperedStatus = rawBody.replace('"status":"CAPTURED"', '"status":"EXPIRED"');
  check("verifyCallbackSignature() rejects tampered status", !verifyCallbackSignature(tamperedStatus, sig));
} else {
  console.log("  (FINPAY_MERCHANT_KEY not set — skipping genuine/tampered verify checks)");
}

console.log(`\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`);
process.exit(failures === 0 ? 0 : 1);
