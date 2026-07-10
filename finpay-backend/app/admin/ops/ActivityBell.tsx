"use client";

/**
 * Header activity bell + right slide-over. The bell shows an unread badge
 * (computed server-side in OpsShell from the ops_activity_seen cookie vs the
 * activity_log). Opening it loads the feed + notify-channel toggles, marks
 * everything read (sets the seen cookie), and refreshes so the badge clears.
 * Every ops mutation logs an entry server-side (opsStore.logActivity).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Activity {
  id: string;
  ts: string;
  kind: string;
  messageEn: string;
  messageId: string;
  tone: string;
}
interface Channels {
  whatsapp: boolean;
  email: boolean;
}

function hhmm(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ActivityBell({ unread }: { unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false); // clears the badge once viewed
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [channels, setChannels] = useState<Channels>({ whatsapp: false, email: false });
  const [busyCh, setBusyCh] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ops/activity");
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities ?? []);
        setChannels(data.channels ?? { whatsapp: false, email: false });
      }
    } finally {
      setLoading(false);
    }
  };

  const openPanel = async () => {
    setOpen(true);
    setOpened(true);
    await load();
    // Mark read (server cookie) + refresh so the server-rendered badge clears.
    try {
      await fetch("/api/admin/ops/activity/seen", { method: "POST" });
      router.refresh();
    } catch {
      /* best-effort */
    }
  };

  const toggle = async (channel: "whatsapp" | "email") => {
    const next = !channels[channel];
    setBusyCh(channel);
    setChannels((c) => ({ ...c, [channel]: next })); // optimistic
    try {
      const res = await fetch("/api/admin/ops/notify-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, enabled: next }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.channels) setChannels(data.channels);
      } else {
        setChannels((c) => ({ ...c, [channel]: !next })); // revert
      }
    } catch {
      setChannels((c) => ({ ...c, [channel]: !next }));
    } finally {
      setBusyCh(null);
    }
  };

  const showBadge = unread > 0 && !opened;

  return (
    <>
      <button
        onClick={openPanel}
        aria-label="Activity"
        title="Activity"
        style={{ position: "relative", width: 40, height: 40, borderRadius: 12, border: "1.5px solid var(--line)", background: "#fff", color: "var(--choco)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 18 }}
      >
        <span aria-hidden>🔔</span>
        {showBadge && (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--red)", color: "#fff", fontSize: 10.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(29,19,10,0.42)", zIndex: 100, display: "flex", justifyContent: "flex-end", animation: "opsScrimIn .18s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(380px, 94vw)", height: "100%", background: "#fff", boxShadow: "-18px 0 50px rgba(29,19,10,0.25)", display: "flex", flexDirection: "column", animation: "opsPanelIn .22s cubic-bezier(0.22,1,0.36,1)" }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "18px 18px 12px", borderBottom: "1.5px solid var(--line)" }}>
              <div>
                <div className="font-display" style={{ fontSize: 20, color: "var(--choco)" }}>Activity</div>
                <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 2 }}>Every change is logged here</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, color: "var(--soft)", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Notify channels */}
            <div style={{ margin: "12px 14px", padding: "12px 14px", background: "var(--surface2)", borderRadius: 14, border: "1.5px solid var(--line)" }}>
              <div style={{ fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--soft)", marginBottom: 10 }}>Notify changes via</div>
              <ToggleRow label="WhatsApp" note="stubbed — no provider yet" on={channels.whatsapp} busy={busyCh === "whatsapp"} onClick={() => toggle("whatsapp")} />
              <ToggleRow label="Email" on={channels.email} busy={busyCh === "email"} onClick={() => toggle("email")} />
            </div>

            {/* Feed */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 4px" }}>
              {loading ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--soft)", fontSize: 13 }}>Loading…</div>
              ) : activities.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--soft)", fontSize: 13 }}>No activity yet.</div>
              ) : (
                activities.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: a.tone, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>{a.messageEn}</div>
                      <div style={{ fontSize: 11, color: "var(--soft)", marginTop: 2 }}>{hhmm(a.ts)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 14px", borderTop: "1.5px solid var(--line)" }}>
              <button onClick={() => setOpen(false)} style={{ width: "100%", padding: "10px", borderRadius: 12, border: "1.5px solid var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Mark all read</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ToggleRow({ label, note, on, busy, onClick }: { label: string; note?: string; on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: "var(--soft)" }}>{note}</div>}
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        role="switch"
        aria-checked={on}
        aria-label={label}
        style={{ width: 40, height: 22, borderRadius: 999, border: "none", background: on ? "var(--orange)" : "rgba(40,26,11,0.18)", position: "relative", cursor: busy ? "default" : "pointer", transition: "background .15s ease", flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left .15s ease" }} />
      </button>
    </div>
  );
}
