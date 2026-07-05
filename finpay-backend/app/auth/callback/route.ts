/**
 * GET /auth/callback — Supabase OAuth return (PRD §6a). Exchanges the PKCE code
 * for a session cookie, then redirects the user back to their resume point
 * (`?next=`). The anon cart in localStorage survives this round-trip untouched.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Only allow same-origin relative resume paths.
  const safeNext = next.startsWith("/") ? next : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/oauth/consent?error=auth`);
    }
  }
  return NextResponse.redirect(`${origin}${safeNext}`);
}
