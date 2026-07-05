"use client";

/**
 * Customer auth state (Google via Supabase — PRD §6a). Wraps the browser
 * Supabase client, exposes the current user + sign-in/out. The anon cart lives
 * in localStorage and survives the OAuth redirect round-trip for free, so no
 * server cart table is needed to satisfy "cart is never lost" (README §2).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => (hasSupabase ? createSupabaseBrowserClient() : null), []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    const toUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null): AuthUser | null => {
      if (!u || !u.email) return null;
      const meta = u.user_metadata ?? {};
      return {
        id: u.id,
        email: u.email,
        name: (meta.full_name as string) || (meta.name as string) || u.email.split("@")[0],
        avatarUrl: meta.avatar_url as string | undefined,
      };
    };
    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(toUser(data.user));
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user ?? null));
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const value: AuthContextValue = {
    user,
    loading,
    signInWithGoogle: async (next = "/") => {
      if (!supabase) {
        // Supabase not configured — surface clearly rather than silently no-op.
        alert("Google sign-in isn't configured yet (Supabase env missing).");
        return;
      }
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used within <AuthProvider>");
  return ctx;
}
