/**
 * Server-side requester identity for customer-facing routes.
 *
 * SECURITY: the mock session (lib/session.ts) is a DEV-only fallback and is
 * NEVER trusted once Supabase auth is configured — otherwise anyone could mint
 * an identity via /api/auth/mock-signin and bypass Google sign-in. In prod
 * (hasSupabase === true) only the verified Supabase user counts.
 */
import { getSupabaseUser } from "./supabase/server";
import { getSession } from "./session";
import { hasSupabase } from "./env";

export interface Requester {
  id: string;
  email: string;
  name: string;
}

export async function getRequester(): Promise<Requester | null> {
  const u = await getSupabaseUser();
  if (u) return { id: u.id, email: u.email, name: u.name };
  if (!hasSupabase) {
    const s = await getSession();
    if (s) return { id: s.id, email: s.email, name: s.name };
  }
  return null;
}
