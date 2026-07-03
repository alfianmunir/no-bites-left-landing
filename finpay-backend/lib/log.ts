/**
 * Structured logging for Finpay requests/responses (PRD rule §13.5:
 * "Log every Finpay request/response (redact Authorization header)").
 *
 * Logs go to stdout as JSON lines. In production, route these to your log
 * drain (Vercel logs, etc.). Never log the raw merchant key or Basic header.
 */

type LogFields = Record<string, unknown>;

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = k.toLowerCase();
    if (key === "authorization" || key === "merchantkey" || key === "finpay_merchant_key") {
      out[k] = "***REDACTED***";
    } else if (key === "headers" && v && typeof v === "object") {
      const h = v as Record<string, unknown>;
      out[k] = Object.fromEntries(
        Object.entries(h).map(([hk, hv]) =>
          hk.toLowerCase() === "authorization" ? [hk, "Basic ***REDACTED***"] : [hk, hv],
        ),
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logFinpay(event: string, fields: LogFields = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    scope: "finpay",
    event,
    ...redact(fields),
  };
  console.log(JSON.stringify(entry));
}

export function logOrder(event: string, fields: LogFields = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    scope: "order",
    event,
    ...redact(fields),
  };
  console.log(JSON.stringify(entry));
}
