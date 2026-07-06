"use client";

import { useState } from "react";
import type { WholesaleRow } from "@/lib/leadStore";

/** wa.me/62<number> — strip non-digits, drop a leading 0, ensure 62 prefix. */
function waHref(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  const noZero = d.replace(/^0/, "");
  const intl = noZero.startsWith("62") ? noZero : "62" + noZero;
  return "https://wa.me/" + intl;
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "12px", fontSize: 13.5, color: "var(--ink)", borderBottom: "1.5px solid var(--line)", verticalAlign: "top" };

export default function WholesaleTable({ initial }: { initial: WholesaleRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (id: string, value: boolean) => {
    setBusy(id);
    // optimistic
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, followedUp: value } : r)));
    try {
      const res = await fetch(`/api/admin/wholesale/${id}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, followedUp: !value } : r))); // revert
    } catch {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, followedUp: !value } : r)));
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--soft)", fontSize: 14 }}>No wholesale requests yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
        <thead>
          <tr>
            <th style={th}>Date</th>
            <th style={th}>Cafe</th>
            <th style={th}>Name · Role</th>
            <th style={th}>City</th>
            <th style={th}>Phone</th>
            <th style={th}>Weekly volume</th>
            <th style={th}>Followed up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ background: r.followedUp ? "var(--tint-success)" : "transparent" }}>
              <td style={{ ...td, whiteSpace: "nowrap", color: "var(--soft)" }}>{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td style={{ ...td, fontWeight: 800 }}>{r.cafe}</td>
              <td style={td}>{r.name}<div style={{ fontSize: 12, color: "var(--soft)" }}>{r.role}</div></td>
              <td style={td}>{r.city}</td>
              <td style={td}>
                <a href={waHref(r.contact)} target="_blank" rel="noreferrer" style={{ color: "var(--green)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}>{r.contact}</a>
              </td>
              <td style={{ ...td, color: "var(--soft)" }}>{r.volume || "—"}</td>
              <td style={td}>
                <button
                  onClick={() => toggle(r.id, !r.followedUp)}
                  disabled={busy === r.id}
                  style={{
                    padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer",
                    border: `1.5px solid ${r.followedUp ? "var(--green)" : "var(--line)"}`,
                    background: r.followedUp ? "var(--green)" : "#fff",
                    color: r.followedUp ? "#fff" : "var(--soft)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.followedUp ? "✓ Followed up" : "Mark followed up"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
