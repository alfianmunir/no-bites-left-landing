"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 20 };

export default function StaffToday({
  name,
  daysThisMonth,
  loggedToday,
  todayLabel,
}: {
  name: string;
  daysThisMonth: number;
  loggedToday: boolean;
  todayLabel: string;
}) {
  const router = useRouter();
  const [logged, setLogged] = useState(loggedToday);
  const [days, setDays] = useState(daysThisMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logDay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ops/attendance/self", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not log today.");
      else {
        if (!logged) setDays((d) => d + 1);
        setLogged(true);
        router.refresh();
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--soft)", fontWeight: 700 }}>{todayLabel}</div>
          <div style={{ fontWeight: 900, fontSize: 22, color: "var(--choco)", marginTop: 2 }}>Hi{name ? `, ${name}` : ""} 👋</div>
        </div>

        {logged ? (
          <div style={{ padding: "14px 20px", borderRadius: 14, background: "var(--tint-success)", border: "1.5px solid var(--green)", color: "var(--green)", fontWeight: 900, fontSize: 15 }}>
            ✓ Today is logged
          </div>
        ) : (
          <button
            onClick={logDay}
            disabled={busy}
            style={{ padding: "16px 28px", borderRadius: 14, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 16, cursor: busy ? "default" : "pointer", minWidth: 200 }}
          >
            {busy ? "Logging…" : "Log today ✓"}
          </button>
        )}

        {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
      </div>

      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13.5, color: "var(--soft)", fontWeight: 700 }}>Days worked this month</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ink)" }}>{days}</div>
      </div>
    </div>
  );
}
