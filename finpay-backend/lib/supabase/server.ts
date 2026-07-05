/**
 * Server Supabase client (cookie-backed via @supabase/ssr) + a helper that
 * resolves the current signed-in customer. Server-only.
 *
 * `getSupabaseUser()` returns the verified identity (id + email + display name)
 * from the auth cookie, or null if not signed in / Supabase not configured. It
 * NEVER trusts client-sent identity — the email used for orders + notifications
 * comes from here.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, hasSupabase } from "../env";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only — safe to
          // ignore; middleware/route handlers refresh the session cookie.
        }
      },
    },
  });
}

export async function getSupabaseUser(): Promise<AuthUser | null> {
  if (!hasSupabase) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  const meta = user.user_metadata ?? {};
  const name = (meta.full_name as string) || (meta.name as string) || user.email.split("@")[0];
  return { id: user.id, email: user.email, name };
}
