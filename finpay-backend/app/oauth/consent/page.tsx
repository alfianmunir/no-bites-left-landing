"use client";

/**
 * /oauth/consent — canonical customer sign-in route (PRD §6a). Both the header
 * "Sign in" link and any deep link land here; it kicks off the Supabase→Google
 * handoff and returns the user to `?next=` (default landing). The checkout gate
 * uses the in-drawer sign-in screen instead (same signInWithGoogle helper).
 */
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

function Consent() {
  const params = useSearchParams();
  const { signInWithGoogle } = useAuth();
  const next = params.get("next") ?? "/";
  const errored = params.get("error");

  useEffect(() => {
    if (!errored) void signInWithGoogle(next);
  }, [errored, next, signInWithGoogle]);

  return (
    <main className="screen-shell" style={{ alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 14 }}>
      <img src="/images/mini-cookies.png" alt="" width={56} height={56} style={{ objectFit: "contain" }} />
      {errored ? (
        <>
          <div className="font-display" style={{ fontSize: 20 }}>Sign-in hiccup</div>
          <div style={{ fontSize: 13.5, color: "var(--soft)" }}>Something went wrong signing you in. Please try again.</div>
          <button className="btn-primary" style={{ maxWidth: 280 }} onClick={() => signInWithGoogle(next)}>Try again</button>
        </>
      ) : (
        <>
          <div className="spinner" />
          <div style={{ fontSize: 13.5, color: "var(--soft)" }}>Taking you to Google…</div>
        </>
      )}
    </main>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<main className="screen-shell" />}>
      <Consent />
    </Suspense>
  );
}
