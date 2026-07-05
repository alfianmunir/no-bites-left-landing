/**
 * Finpay PG client (Hosted Payment). Server-only.
 *
 * Endpoints (base = FINPAY_BASE_URL, sandbox: https://devo.finnet.co.id):
 *   POST {base}/pg/payment/card/initiate
 *   GET  {base}/pg/payment/card/check/{orderId}
 *   GET  {base}/pg/payment/card/cancel/{orderId}
 *   POST {base}/pg/payment/card/refund
 *
 * Auth: Authorization: Basic base64(merchantId:merchantKey) + JSON accept/content.
 * Every request/response is logged with the Authorization header redacted.
 */
import crypto from "node:crypto";
import { env } from "./env";
import { logFinpay } from "./log";
import type { OrderItem, Customer } from "./orders";

function authHeader(): string {
  const raw = `${env.finpay.merchantId}:${env.finpay.merchantKey}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

function baseHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: authHeader(),
  };
}

export interface InitiateParams {
  orderId: string;
  amount: number; // integer IDR
  description: string;
  timeoutMinutes: number;
  customer: Customer;
  items?: OrderItem[];
  successUrl: string;
  failUrl: string;
  backUrl: string;
  callbackUrl: string;
  /** Preselected payment method on the hosted page; defaults to QRIS. */
  sourceOfFunds?: string;
}

/**
 * Finpay Hosted Payment launch set (E2E PRD §3 / README §5). QRIS is the
 * default/primary method (PRD §4). `sourceOfFunds` preselects it on the hosted
 * page. PRD §12 Q5 (hard-lock vs default-with-switch) is still open — this
 * defaults to QRIS while leaving the others enabled; confirm against sandbox.
 */
export const DEFAULT_SOURCE_OF_FUNDS = "qris";
export const ENABLED_SOURCES_OF_FUNDS = [
  "qris",
  "dana",
  "ovo",
  "shopeepay",
  "vabca",
  "vabni",
  "vabri",
  "vamandiri",
] as const;

export interface InitiateResult {
  ok: boolean;
  responseCode: string | null;
  responseMessage: string | null;
  redirectUrl: string | null;
  /** Raw Finpay "YYYY-MM-DD HH:MM:SS" string, and our ISO interpretation. */
  expiryLinkRaw: string | null;
  expiryLinkIso: string | null;
  traceId: string | null;
  raw: unknown;
}

/**
 * Finpay returns expiryLink as "YYYY-MM-DD HH:MM:SS" with no timezone. Finpay
 * is Jakarta-based; we interpret it as WIB (UTC+7). TODO(§open): confirm tz with
 * Finpay support — reconciliation is the safety net regardless of tz drift.
 */
export function parseFinpayTimestamp(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m;
  const iso = `${Y}-${Mo}-${D}T${H}:${Mi}:${S}+07:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function initiate(params: InitiateParams): Promise<InitiateResult> {
  const url = `${env.finpay.baseUrl}/pg/payment/card/initiate`;
  const body: Record<string, unknown> = {
    order: {
      id: params.orderId,
      amount: String(params.amount), // Finpay expects amount as string on initiate
      currency: "IDR",
      description: params.description.slice(0, 127), // docs: order.description max 127
      timeout: params.timeoutMinutes,
    },
    customer: {
      email: params.customer.email,
      firstName: params.customer.firstName,
      lastName: params.customer.lastName,
      mobilePhone: params.customer.mobilePhone,
    },
    url: {
      successUrl: params.successUrl,
      failUrl: params.failUrl,
      backUrl: params.backUrl,
      callbackUrl: params.callbackUrl,
    },
    // QRIS is the default payment method on the hosted page (PRD §4).
    sourceOfFunds: params.sourceOfFunds ?? DEFAULT_SOURCE_OF_FUNDS,
  };
  if (params.items && params.items.length > 0) {
    (body.order as Record<string, unknown>).item = params.items.map((it) => ({
      sku: it.sku,
      name: it.name,
      quantity: it.qty,
      unitPrice: it.unit_price,
    }));
  }

  logFinpay("initiate.request", { url, orderId: params.orderId, amount: params.amount, body });

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: baseHeaders(), body: JSON.stringify(body) });
  } catch (e) {
    logFinpay("initiate.network_error", { orderId: params.orderId, error: String(e) });
    return {
      ok: false,
      responseCode: null,
      responseMessage: "network_error",
      redirectUrl: null,
      expiryLinkRaw: null,
      expiryLinkIso: null,
      traceId: null,
      raw: { error: String(e) },
    };
  }

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { _unparsed: text };
  }

  const responseCode = (parsed.responseCode as string) ?? null;
  const redirectUrl = (parsed.redirecturl as string) ?? null;
  const expiryLinkRaw = (parsed.expiryLink as string) ?? null;
  const ok = res.ok && responseCode === "2000000" && Boolean(redirectUrl);

  logFinpay("initiate.response", {
    orderId: params.orderId,
    httpStatus: res.status,
    responseCode,
    hasRedirect: Boolean(redirectUrl),
    traceId: parsed.traceId ?? null,
  });

  return {
    ok,
    responseCode,
    responseMessage: (parsed.responseMessage as string) ?? null,
    redirectUrl,
    expiryLinkRaw,
    expiryLinkIso: parseFinpayTimestamp(expiryLinkRaw),
    traceId: (parsed.traceId as string) ?? null,
    raw: parsed,
  };
}

export interface CheckStatusResult {
  ok: boolean;
  responseCode: string | null;
  /** Finpay payment status, e.g. REQUEST_INITIATED, CAPTURED. */
  paymentStatus: string | null;
  orderAmount: number | null;
  traceId: string | null;
  raw: unknown;
}

export async function checkStatus(orderId: string): Promise<CheckStatusResult> {
  const url = `${env.finpay.baseUrl}/pg/payment/card/check/${encodeURIComponent(orderId)}`;
  logFinpay("check.request", { url, orderId });

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: baseHeaders() });
  } catch (e) {
    logFinpay("check.network_error", { orderId, error: String(e) });
    return { ok: false, responseCode: null, paymentStatus: null, orderAmount: null, traceId: null, raw: { error: String(e) } };
  }

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { _unparsed: text };
  }

  const data = (parsed.data as Record<string, unknown>) ?? {};
  const order = (data.order as Record<string, unknown>) ?? {};
  const result = (data.result as Record<string, unknown>) ?? {};
  const payment = (result.payment as Record<string, unknown>) ?? {};
  const paymentStatus = (payment.status as string) ?? null;

  logFinpay("check.response", { orderId, httpStatus: res.status, responseCode: parsed.responseCode ?? null, paymentStatus });

  return {
    ok: res.ok && parsed.responseCode === "2000000",
    responseCode: (parsed.responseCode as string) ?? null,
    paymentStatus,
    orderAmount: order.amount != null ? Number(order.amount) : null,
    traceId: (parsed.traceId as string) ?? null,
    raw: parsed,
  };
}

export async function cancelOrder(orderId: string): Promise<{ ok: boolean; raw: unknown }> {
  const url = `${env.finpay.baseUrl}/pg/payment/card/cancel/${encodeURIComponent(orderId)}`;
  logFinpay("cancel.request", { url, orderId });
  const res = await fetch(url, { method: "GET", headers: baseHeaders() });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _unparsed: text };
  }
  const ok = res.ok && (parsed as Record<string, unknown>).responseCode === "2000000";
  logFinpay("cancel.response", { orderId, httpStatus: res.status, ok });
  return { ok, raw: parsed };
}

export async function refundOrder(orderId: string, amount: number): Promise<{ ok: boolean; raw: unknown }> {
  const url = `${env.finpay.baseUrl}/pg/payment/card/refund`;
  const body = { order: { id: orderId, amount: String(amount) } };
  logFinpay("refund.request", { url, orderId, amount });
  const res = await fetch(url, { method: "POST", headers: baseHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _unparsed: text };
  }
  const ok = res.ok && (parsed as Record<string, unknown>).responseCode === "2000000";
  logFinpay("refund.response", { orderId, httpStatus: res.status, ok });
  return { ok, raw: parsed };
}

// ---------------------------------------------------------------------------
// Callback signature verification (used by the Phase 2 webhook).
// ---------------------------------------------------------------------------

/**
 * Remove the top-level "signature":"..." field from the RAW callback body via
 * string surgery (NOT parse→re-encode), so we HMAC byte-identical content to
 * what Finpay signed. PRD §6 warns re-serialization is the #1 integration bug.
 */
export function stripSignatureField(rawBody: string): string {
  let text = rawBody.replace(/"signature"\s*:\s*"[^"]*"/, "");
  text = text.replace(/,\s*}/g, "}");
  text = text.replace(/{\s*,/g, "{");
  text = text.replace(/,\s*,/g, ",");
  return text;
}

export function computeSignature(bodyWithoutSignature: string, merchantKey: string = env.finpay.merchantKey): string {
  return crypto.createHmac("sha512", merchantKey).update(bodyWithoutSignature, "utf8").digest("hex");
}

/**
 * Verify a callback. Returns true only if the HMAC of the raw-body-minus-
 * signature matches the provided signature (constant-time compare).
 */
export function verifyCallbackSignature(rawBody: string, providedSignature: string): boolean {
  if (!providedSignature) return false;
  const expected = computeSignature(stripSignatureField(rawBody));
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(providedSignature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
