"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError("Incorrect password.");
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: "0 20px" }}>
      <div className="font-display" style={{ fontSize: 20, color: "var(--choco)", marginBottom: 16 }}>Admin sign in</div>
      <input
        type="password"
        className="field-input"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</div>}
      <button className="btn-calm" style={{ marginTop: 14 }} disabled={busy || !password} onClick={submit}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </main>
  );
}
