"use client";

/** Google sign-in stand-in (see lib/session.ts) — one click, no form. */
export default function SignInModal({
  onSignedIn,
  onClose,
}: {
  onSignedIn: () => void;
  onClose: () => void;
}) {
  async function continueWithGoogle() {
    await fetch("/api/auth/mock-signin", { method: "POST" });
    onSignedIn();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(29,19,10,0.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 340,
          background: "var(--surface)",
          borderRadius: 24,
          padding: "40px 28px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <img src="/images/mini-cookies.png" alt="" style={{ height: 52, width: "auto" }} />
        <div className="font-display" style={{ fontSize: 22 }}>Sign in to order</div>
        <div style={{ fontSize: 14, color: "var(--soft)", maxWidth: 260, lineHeight: 1.5 }}>
          Track your order status and check out faster next time.
        </div>
        <button
          onClick={continueWithGoogle}
          style={{
            marginTop: 10,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 14,
            borderRadius: 14,
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            fontWeight: 800,
            fontSize: 14.5,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "conic-gradient(#4285F4 0 25%, #34A853 25% 50%, #FBBC05 50% 75%, #EA4335 75% 100%)",
              display: "inline-block",
            }}
          />
          Continue with Google
        </button>
        <div style={{ fontSize: 11, color: "var(--soft)", maxWidth: 280, marginTop: 6 }}>
          By continuing you agree to our Terms &amp; Privacy Policy. No passwords, no forms.
        </div>
      </div>
    </div>
  );
}
