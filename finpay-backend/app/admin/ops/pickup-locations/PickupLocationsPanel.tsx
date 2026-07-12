"use client";

/**
 * Admin CRUD over pickup_locations + the same-day cutoff in pickup_settings.
 * Design reference: "No Bites Left - Ops Revamp.dc.html" (Order → Pickup
 * locations). Rule logic + "next open" preview come from lib/pickup.ts so the
 * admin sees exactly what the storefront calendar will compute.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { nextPickupDates, ruleLabel, formatPickupDate, type PickupLocation, type PickupRule, type PickupSettings } from "@/lib/pickup";

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1.5px solid var(--line)", fontSize: 14, background: "#fff", color: "var(--ink)", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--soft)", marginBottom: 3, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", borderRadius: 9, border: "none", background: "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 12px", borderRadius: 9, border: "1.5px solid var(--line)", background: "#fff", color: "var(--soft)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" };

const RULE_TYPES: { value: PickupRule["type"]; label: string }[] = [
  { value: "everyday", label: "Every day" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "day", label: "Specific weekday" },
  { value: "twin", label: "Twin dates (01/01…)" },
  { value: "external", label: "External (Shopee / GrabFood)" },
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ruleToDraft(rule: PickupRule) {
  return {
    type: rule.type,
    day: rule.type === "day" ? rule.day : 4,
    shopee: rule.type === "external" ? rule.shopee ?? "" : "",
    grab: rule.type === "external" ? rule.grab ?? "" : "",
  };
}
type RuleDraft = ReturnType<typeof ruleToDraft>;

function draftToRule(d: RuleDraft): PickupRule {
  switch (d.type) {
    case "day": return { type: "day", day: d.day };
    case "external": return { type: "external", ...(d.shopee ? { shopee: d.shopee } : {}), ...(d.grab ? { grab: d.grab } : {}) };
    case "weekdays": return { type: "weekdays" };
    case "twin": return { type: "twin" };
    default: return { type: "everyday" };
  }
}

function NextOpen({ rule, cutoff }: { rule: PickupRule; cutoff: string }) {
  if (rule.type === "external") return <span style={{ fontSize: 12, color: "var(--soft)" }}>No calendar — marketplace order</span>;
  const dates = nextPickupDates(rule, 3, new Date(), cutoff);
  if (dates.length === 0) return <span style={{ fontSize: 12, color: "var(--red)" }}>No open dates in the next ~14 months</span>;
  return <span style={{ fontSize: 12, color: "var(--soft)" }}>Next open: <b style={{ color: "var(--choco)" }}>{dates.map(formatPickupDate).join(" · ")}</b></span>;
}

function RuleEditor({ draft, onChange }: { draft: RuleDraft; onChange: (d: RuleDraft) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <label style={labelStyle}>Availability rule</label>
        <select style={inputStyle} value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value as PickupRule["type"] })}>
          {RULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {draft.type === "day" && (
        <div>
          <label style={labelStyle}>Which day</label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {DOW.map((d, i) => (
              <button key={d} onClick={() => onChange({ ...draft, day: i })} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", border: `1.5px solid ${draft.day === i ? "var(--choco)" : "var(--line)"}`, background: draft.day === i ? "var(--choco)" : "#fff", color: draft.day === i ? "#fff" : "var(--soft)" }}>{d}</button>
            ))}
          </div>
        </div>
      )}
      {draft.type === "external" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div><label style={labelStyle}>Shopee URL</label><input style={inputStyle} value={draft.shopee} onChange={(e) => onChange({ ...draft, shopee: e.target.value })} placeholder="https://shopee.co.id/…" /></div>
          <div><label style={labelStyle}>GrabFood URL</label><input style={inputStyle} value={draft.grab} onChange={(e) => onChange({ ...draft, grab: e.target.value })} placeholder="https://food.grab.com/…" /></div>
        </div>
      )}
    </div>
  );
}

function LocationRow({ loc, cutoff }: { loc: PickupLocation; cutoff: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(loc.name);
  const [area, setArea] = useState(loc.area);
  const [draft, setDraft] = useState<RuleDraft>(ruleToDraft(loc.rule));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/admin/pickup-locations/${loc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, area, rule: draftToRule(draft) }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Save failed.");
    setEditing(false);
    router.refresh();
  };

  const toggleActive = async () => {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/admin/pickup-locations/${loc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !loc.active }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Update failed.");
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(`Remove ${loc.name}?`)) return;
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/admin/pickup-locations/${loc.id}`, { method: "DELETE" });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Remove failed.");
    router.refresh();
  };

  if (editing) {
    return (
      <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label style={labelStyle}>Area / detail</label><input style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} /></div>
        </div>
        <RuleEditor draft={draft} onChange={setDraft} />
        <NextOpen rule={draftToRule(draft)} cutoff={cutoff} />
        {error && <div style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={save} disabled={busy} style={btnPrimary}>{busy ? "…" : "Save"}</button>
          <button onClick={() => { setEditing(false); setName(loc.name); setArea(loc.area); setDraft(ruleToDraft(loc.rule)); }} style={btnGhost}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "11px 0", borderBottom: "1px solid var(--line)", opacity: loc.active ? 1 : 0.55 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{loc.name} {!loc.active && <span style={{ fontSize: 10, fontWeight: 900, color: "var(--soft)" }}>· HIDDEN</span>}</div>
        <div style={{ fontSize: 12.5, color: "var(--soft)" }}>{loc.area}</div>
        <div style={{ fontSize: 11.5, color: "var(--choco)", fontWeight: 700, marginTop: 2 }}>{ruleLabel(loc.rule)}</div>
        <div style={{ marginTop: 2 }}><NextOpen rule={loc.rule} cutoff={cutoff} /></div>
        {error && <div style={{ color: "var(--red)", fontSize: 12, fontWeight: 700, marginTop: 3 }}>{error}</div>}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button onClick={toggleActive} disabled={busy} style={{ ...btnGhost, color: loc.active ? "var(--soft)" : "var(--green)" }}>{loc.active ? "Hide" : "Show"}</button>
        <button onClick={() => setEditing(true)} style={{ ...btnGhost, color: "var(--choco)" }}>Edit</button>
        <button onClick={remove} disabled={busy} style={{ ...btnGhost, color: "var(--red)" }}>🗑</button>
      </div>
    </div>
  );
}

function AddLocation({ cutoff }: { cutoff: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [draft, setDraft] = useState<RuleDraft>({ type: "everyday", day: 4, shopee: "", grab: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    setBusy(true);
    const res = await fetch("/api/admin/pickup-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, area, rule: draftToRule(draft) }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Save failed.");
    setName(""); setArea(""); setDraft({ type: "everyday", day: 4, shopee: "", grab: "" }); setOpen(false);
    router.refresh();
  };

  if (!open) return <button onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 999, border: "1.5px dashed var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", marginTop: 8 }}>+ Add location</button>;

  return (
    <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Paragon Office" /></div>
        <div><label style={labelStyle}>Area / detail</label><input style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Central · lobby reception" /></div>
      </div>
      <RuleEditor draft={draft} onChange={setDraft} />
      <NextOpen rule={draftToRule(draft)} cutoff={cutoff} />
      {error && <div style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={add} disabled={busy} style={btnPrimary}>{busy ? "…" : "Add location"}</button>
        <button onClick={() => setOpen(false)} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

function SettingsCard({ settings }: { settings: PickupSettings }) {
  const router = useRouter();
  const [cutoff, setCutoff] = useState(settings.sameDayCutoffWib);
  const [from, setFrom] = useState(settings.openFromWib);
  const [to, setTo] = useState(settings.openToWib);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setError(null); setSaved(false); setBusy(true);
    const res = await fetch("/api/admin/pickup-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sameDayCutoffWib: cutoff, openFromWib: from, openToWib: to }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Save failed.");
    setSaved(true);
    router.refresh();
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>Timing</div>
      <div style={{ fontSize: 12.5, color: "var(--soft)" }}>
        Paid at/before the cutoff → earliest pickup is the next day (H+1); after the cutoff → the day after (H+2). All times WIB.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><label style={labelStyle}>Same-day cutoff</label><input type="time" style={inputStyle} value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></div>
        <div><label style={labelStyle}>Opens</label><input type="time" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label style={labelStyle}>Closes</label><input type="time" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
      {saved && !error && <div style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 700 }}>✓ Saved</div>}
      <button onClick={save} disabled={busy} style={{ ...btnPrimary, alignSelf: "flex-start" }}>{busy ? "Saving…" : "Save timing"}</button>
    </div>
  );
}

export default function PickupLocationsPanel({ initialLocations, initialSettings }: { initialLocations: PickupLocation[]; initialSettings: PickupSettings }) {
  const cutoff = initialSettings.sameDayCutoffWib;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SettingsCard settings={initialSettings} />
      <div style={{ ...card, display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)", marginBottom: 6 }}>Locations · {initialLocations.length}</div>
        {initialLocations.map((l) => <LocationRow key={l.id} loc={l} cutoff={cutoff} />)}
        <AddLocation cutoff={cutoff} />
      </div>
    </div>
  );
}
