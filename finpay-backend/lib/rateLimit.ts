/**
 * Minimal in-memory sliding-window rate limiter for public form endpoints.
 *
 * Per-instance only (serverless functions don't share memory), so it's a
 * mitigation, not a hard guarantee — it blunts single-source floods and bot
 * loops without new infra. For strong global limits, back this with Upstash/DB.
 */
const WINDOWS = new Map<string, number[]>();

export interface RateResult { ok: boolean; retryAfterSec: number }

export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (WINDOWS.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    WINDOWS.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  WINDOWS.set(key, hits);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (WINDOWS.size > 5000) {
    for (const [k, v] of WINDOWS) {
      if (v.every((t) => t <= cutoff)) WINDOWS.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
