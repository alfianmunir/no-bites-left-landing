/**
 * Mock customer session — NOT real auth. Stands in for Google sign-in so the
 * ordering flow (saved addresses, My Orders) is fully clickable before a real
 * OAuth provider is wired up. One click creates a stable per-browser identity;
 * swap this module for real Google OAuth (e.g. NextAuth) before launch — call
 * sites (getSession/createMockSession/clearSession) are the seam to replace.
 */
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { env } from "./env";
import { encodeSignedValue, decodeSignedValue } from "./signedCookie";

export const SESSION_COOKIE = "nbl_session";

export interface Session {
  id: string;
  email: string;
  name: string;
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSignedValue<Session>(store.get(SESSION_COOKIE)?.value, env.sessionSecret);
}

export function createMockSession(): Session {
  const id = crypto.randomBytes(6).toString("hex");
  return { id, email: `guest-${id}@example.com`, name: "Guest" };
}

export function encodeSession(session: Session): string {
  return encodeSignedValue(session, env.sessionSecret);
}
