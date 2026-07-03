/**
 * Admin session — gated by a single shared password (env.adminPassword),
 * matching PRD §8's "Basic auth or magic link — no user system" for the 1-2
 * person ops team. Signed cookie via lib/signedCookie.ts (same HMAC pattern
 * as lib/finpay.ts's callback signature verification).
 */
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { env } from "./env";
import { encodeSignedValue, decodeSignedValue } from "./signedCookie";

export const ADMIN_COOKIE = "nbl_admin";

interface AdminSessionPayload {
  admin: true;
  issuedAt: number;
}

export function verifyAdminPassword(candidate: string): boolean {
  if (!env.adminPassword) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(env.adminPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function encodeAdminSession(): string {
  return encodeSignedValue<AdminSessionPayload>({ admin: true, issuedAt: Date.now() }, env.sessionSecret);
}

export function verifyAdminCookieValue(raw: string | undefined): boolean {
  return decodeSignedValue<AdminSessionPayload>(raw, env.sessionSecret)?.admin === true;
}

export async function isAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminCookieValue(store.get(ADMIN_COOKIE)?.value);
}
