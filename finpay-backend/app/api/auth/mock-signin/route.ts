/**
 * POST /api/auth/mock-signin — stands in for "Continue with Google" (see
 * lib/session.ts). One click, no form, matching the design's promise; issues
 * a stable per-browser identity.
 */
import { NextResponse } from "next/server";
import { createMockSession, encodeSession, SESSION_COOKIE, getSession } from "@/lib/session";
import { hasSupabase } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  // SECURITY: DEV-only stand-in for Google sign-in. Disabled once real Supabase
  // auth is configured — otherwise anyone could mint an identity here and bypass
  // sign-in (order routes also ignore mock sessions in that case, lib/identity.ts).
  if (hasSupabase) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existing = await getSession();
  const session = existing ?? createMockSession();
  const res = NextResponse.json(session);
  res.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
