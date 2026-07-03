/**
 * Generic signed-cookie helper: base64url(json payload) + "." + HMAC-SHA256
 * hex digest, constant-time verified. Used for both the mock customer session
 * and the admin session — neither is a real auth system, just enough to gate
 * routes and identify a browser across visits.
 */
import crypto from "node:crypto";

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function encodeSignedValue<T>(data: T, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSignedValue<T>(raw: string | undefined, secret: string): T | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
