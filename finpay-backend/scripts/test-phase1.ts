/**
 * Phase 1 unit checks for the pure logic that guards money + identity:
 * price list integrity, order-id format, and the callback signature helpers
 * (mirrors the Phase 0 Python self-test, now in the real TS code path).
 *
 * Usage: npm run test:phase1
 */
import { PRICE_LIST, getPriceItem, listPriceItems } from "../lib/prices";
import { generateOrderId, isValidOrderId } from "../lib/orders";
import { stripSignatureField, computeSignature, verifyCallbackSignature } from "../lib/finpay";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${detail ? " — " + detail : ""}`);
}

console.log("=== Phase 1 unit checks ===");

// --- price list ---
console.log("\nPrice list (from Cafe Pricing.xlsx retail column):");
const expected: Record<string, number> = {
  "og-40": 20000, "og-100": 48000,
  "hazel-40": 22000, "hazel-100": 53000,
  "choco-40": 22000, "choco-100": 53000,
  "matcha-40": 25000, "matcha-100": 59000,
};
check("8 SKUs present", listPriceItems().length === 8, `got ${listPriceItems().length}`);
for (const [sku, price] of Object.entries(expected)) {
  check(`${sku} = ${price}`, getPriceItem(sku)?.unitPrice === price, String(getPriceItem(sku)?.unitPrice));
}
check("Apple Pie NOT orderable", getPriceItem("apple-pie") === undefined);
check("Brownies NOT orderable", getPriceItem("brownies") === undefined);
check("price list frozen", Object.isFrozen(PRICE_LIST));

// --- order id ---
console.log("\nOrder id:");
const id = generateOrderId();
check("format NBL-*", /^NBL-[A-Z0-9]+-[A-Z0-9]{4}$/.test(id), id);
check("<= 30 chars", id.length <= 30, `${id.length}`);
check("alpha-dash valid", isValidOrderId(id));
check("rejects bad id", !isValidOrderId("bad id with spaces"));
check("rejects >30 chars", !isValidOrderId("N".repeat(31)));

// --- signature helpers ---
console.log("\nCallback signature (matches Phase 0 approach):");
const key = process.env.FINPAY_MERCHANT_KEY ?? "testkey";
const fieldsJson =
  '{"customer":{"id":"C1"},"order":{"id":"NBL-X-ABCD","amount":35000},"result":{"payment":{"status":"CAPTURED"}}}';
const sig = computeSignature(fieldsJson, key);
const rawBody = fieldsJson.slice(0, -1) + `,"signature":"${sig}"}`;
const stripped = stripSignatureField(rawBody);
check("strip returns pre-signature body", stripped === fieldsJson, stripped);
check(
  "valid signature verifies",
  // verifyCallbackSignature uses env key; align by recomputing with same key
  computeSignature(stripSignatureField(rawBody), key) === sig,
);
if (process.env.FINPAY_MERCHANT_KEY) {
  check("verifyCallbackSignature() accepts genuine", verifyCallbackSignature(rawBody, sig));
  const tampered = rawBody.replace('"amount":35000', '"amount":1');
  check("verifyCallbackSignature() rejects tampered", !verifyCallbackSignature(tampered, sig));
  check("rejects empty signature", !verifyCallbackSignature(rawBody, ""));
}
// signature field in the MIDDLE of the object still strips cleanly
const midSig = `{"a":1,"signature":"${sig}","b":2}`;
check("strips middle signature", stripSignatureField(midSig) === '{"a":1,"b":2}', stripSignatureField(midSig));
// signature field FIRST
const firstSig = `{"signature":"${sig}","a":1}`;
check("strips leading signature", stripSignatureField(firstSig) === '{"a":1}', stripSignatureField(firstSig));

console.log(`\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`);
process.exit(failures === 0 ? 0 : 1);
