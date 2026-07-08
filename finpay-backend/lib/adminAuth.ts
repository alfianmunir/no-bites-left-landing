/**
 * Admin / staff session — a shared super-admin password (env.adminPassword)
 * plus per-staff logins (ops.staff password_hash, see lib/password.ts). Matches
 * PRD §8's "Basic auth or magic link — no user system" for the small ops team.
 * Signed cookie via lib/signedCookie.ts (same HMAC pattern as lib/finpay.ts).
 *
 * Roles: 'super_admin' (full console) and 'staff' (scoped ops — log day, QoH
 * stock, receive/opname, start batches without labor). isAdminSession() stays
 * super-admin-only so every existing gate keeps its meaning; staff-reachable
 * screens use getOpsSession()/requireOps() and branch on role.
 */
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { env } from "./env";
import { encodeSignedValue, decodeSignedValue } from "./signedCookie";

export const ADMIN_COOKIE = "nbl_admin";

export type OpsRole = "super_admin" | "staff";

export interface OpsSession {
  role: OpsRole;
  staffId?: string;
}

interface AdminSessionPayload {
  admin: true;
  role?: OpsRole; // absent on legacy cookies → treated as super_admin
  staffId?: string;
  issuedAt: number;
}

export function verifyAdminPassword(candidate: string): boolean {
  if (!env.adminPassword) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(env.adminPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Encode a session cookie for the given role (+staffId for staff sessions). */
export function encodeAdminSession(role: OpsRole = "super_admin", staffId?: string): string {
  return encodeSignedValue<AdminSessionPayload>({ admin: true, role, staffId, issuedAt: Date.now() }, env.sessionSecret);
}

function decode(raw: string | undefined): AdminSessionPayload | null {
  const payload = decodeSignedValue<AdminSessionPayload>(raw, env.sessionSecret);
  return payload?.admin === true ? payload : null;
}

export function verifyAdminCookieValue(raw: string | undefined): boolean {
  return decode(raw) !== null;
}

/** Full session (role + staffId), or null if not signed in. */
export async function getOpsSession(): Promise<OpsSession | null> {
  const store = await cookies();
  const payload = decode(store.get(ADMIN_COOKIE)?.value);
  if (!payload) return null;
  const role: OpsRole = payload.role === "staff" ? "staff" : "super_admin";
  return { role, staffId: payload.staffId };
}

/** True only for a super-admin session (keeps every existing gate super-admin-only). */
export async function isAdminSession(): Promise<boolean> {
  return (await getOpsSession())?.role === "super_admin";
}

/** True for any signed-in ops user (super-admin OR staff). Gate for the screens
 *  staff can reach (today, stock, receive, opname, production + their APIs). */
export async function isOpsUser(): Promise<boolean> {
  return (await getOpsSession()) !== null;
}
