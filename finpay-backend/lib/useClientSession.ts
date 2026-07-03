"use client";

/** Client-side read of the mock session (see lib/session.ts) via /api/auth/me. */
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@/lib/session";

export function useClientSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = loading
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    setSession(data.session);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    const res = await fetch("/api/auth/mock-signin", { method: "POST" });
    const data = await res.json();
    setSession(data);
    return data as Session;
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setSession(null);
  }, []);

  return { session, loading, signIn, signOut, refresh };
}
