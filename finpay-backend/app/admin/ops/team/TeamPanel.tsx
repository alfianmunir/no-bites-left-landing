"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffRow, PayrollPreviewLine, PayrollRunRow } from "@/lib/opsStore";

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const PAY_LABEL: Record<string, string> = { monthly: "monthly", daily: "per bake day", per_batch: "per batch" };

// ---------------------------------------------------------------- Staff
function StaffSection({ staff, today }: { staff: StaffRow[]; today: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("baker");
  const [payType, setPayType] = useState("daily");
  const [rate, setRate] = useState("");
  const [batchBonus, setBatchBonus] = useState("");
  const [attDate, setAttDate] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json().then((d) => ({ ok: res.ok, d }));
  };

  const addStaff = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    if (rate === "" || Number(rate) < 0) return setError("Enter a rate.");
    setBusy("add");
    const { ok, d } = await post("/api/admin/ops/staff", { name, role, payType, rate: Number(rate), batchBonus: batchBonus === "" ? 0 : Number(batchBonus) });
    setBusy(null);
    if (!ok) setError(d.error ?? "Save failed.");
    else { setName(""); setRate(""); setBatchBonus(""); setAdding(false); router.refresh(); }
  };

  const toggle = async (s: StaffRow) => {
    setBusy(s.id);
    await post("/api/admin/ops/staff", { action: "toggle", staffId: s.id, active: !s.active });
    setBusy(null);
    router.refresh();
  };

  const logDay = async (s: StaffRow) => {
    setBusy("att-" + s.id);
    await post("/api/admin/ops/attendance", { staffId: s.id, date: attDate });
    setBusy(null);
    router.refresh();
  };

  const saveLogin = async (s: StaffRow) => {
    setError(null);
    if (pwd.length < 4) return setError("Password must be at least 4 characters.");
    setBusy("login-" + s.id);
    const { ok, d } = await post("/api/admin/ops/staff", { action: "setlogin", staffId: s.id, password: pwd });
    setBusy(null);
    if (!ok) setError(d.error ?? "Could not set login.");
    else { setPwd(""); setLoginFor(null); router.refresh(); }
  };

  const disableLogin = async (s: StaffRow) => {
    if (!confirm(`Disable login for ${s.name}?`)) return;
    setBusy("login-" + s.id);
    await post("/api/admin/ops/staff", { action: "disablelogin", staffId: s.id });
    setBusy(null);
    router.refresh();
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>Staff</div>
        <button onClick={() => setAdding((v) => !v)} style={{ border: "1.5px solid var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", padding: "6px 12px", borderRadius: 999 }}>{adding ? "Cancel" : "+ Add staff"}</button>
      </div>

      {adding && (
        <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label style={labelStyle}>Role</label>
              <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
                {["baker", "packer", "officer", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Pay type</label>
              <select style={inputStyle} value={payType} onChange={(e) => setPayType(e.target.value)}>
                <option value="daily">per bake day</option>
                <option value="monthly">monthly</option>
                <option value="per_batch">per batch</option>
              </select>
            </div>
            <div><label style={labelStyle}>Rate (Rp)</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div><label style={labelStyle}>Batch bonus</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={batchBonus} onChange={(e) => setBatchBonus(e.target.value)} placeholder="0" /></div>
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <button onClick={addStaff} disabled={busy === "add"} style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>{busy === "add" ? "Saving…" : "Add staff"}</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--soft)" }}>
        <span style={{ fontWeight: 800 }}>Log attendance for</span>
        <input type="date" style={{ ...inputStyle, width: "auto", padding: "6px 10px" }} value={attDate} onChange={(e) => setAttDate(e.target.value)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {staff.map((s) => (
          <div key={s.id} style={{ padding: "10px 12px", border: "1.5px solid var(--line)", borderRadius: 12, background: s.active ? "#fff" : "var(--surface2)", opacity: s.active ? 1 : 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</span>
                {s.canLogin && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 900, color: "var(--green)", background: "var(--tint-success)", borderRadius: 999, padding: "2px 8px" }}>LOGIN</span>}
                <span style={{ color: "var(--soft)", fontSize: 12.5 }}> · {s.role} · {rupiah(s.rate)} {PAY_LABEL[s.payType] ?? s.payType}{s.batchBonus > 0 ? ` · +${rupiah(s.batchBonus)}/batch` : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {s.active && (
                  <button onClick={() => logDay(s)} disabled={busy === "att-" + s.id} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{busy === "att-" + s.id ? "…" : "Log day"}</button>
                )}
                <button onClick={() => { setLoginFor(loginFor === s.id ? null : s.id); setPwd(""); setError(null); }} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{s.canLogin ? "Login…" : "Set login"}</button>
                <button onClick={() => toggle(s)} disabled={busy === s.id} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", color: "var(--soft)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{s.active ? "Deactivate" : "Reactivate"}</button>
              </div>
            </div>

            {loginFor === s.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={labelStyle}>{s.canLogin ? "Reset login password" : "Set a login password"}</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input type="text" autoComplete="off" style={{ ...inputStyle, width: "auto", flex: "1 1 180px" }} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="new password" />
                  <button onClick={() => saveLogin(s)} disabled={busy === "login-" + s.id} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{busy === "login-" + s.id ? "Saving…" : "Save"}</button>
                  {s.canLogin && <button onClick={() => disableLogin(s)} disabled={busy === "login-" + s.id} style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid var(--line)", background: "#fff", color: "var(--red)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Disable</button>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--soft)" }}>They sign in at the same admin login with just this password. Give them: their password (no username needed).</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Payroll
function PayrollSection({ preview, period, total, thrTotal, alreadyRun, runs }: {
  preview: PayrollPreviewLine[];
  period: string;
  total: number;
  thrTotal: number;
  alreadyRun: boolean;
  runs: PayrollRunRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const changePeriod = (p: string) => {
    // Server reads ?period=; navigate with the query so the preview recomputes.
    router.push(`/admin/ops/team?period=${p}`);
  };

  const run = async () => {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/admin/ops/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) setError(d.error ?? "Payroll run failed.");
    else { setDone(true); router.refresh(); }
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>Payroll</div>
        <input type="month" style={{ ...inputStyle, width: "auto", padding: "7px 10px" }} value={period} onChange={(e) => e.target.value && changePeriod(e.target.value)} />
      </div>

      <div style={{ overflowX: "auto", border: "1.5px solid var(--line)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {["Staff", "Basis", "Base", "Bonus", "THR accr.", "Net"].map((h, i) => (
                <th key={h} style={{ textAlign: i >= 2 ? "right" : "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((l) => (
              <tr key={l.staffId}>
                <td style={{ padding: "9px 10px", fontSize: 13, fontWeight: 700, borderBottom: "1px solid var(--line)" }}>{l.name}</td>
                <td style={{ padding: "9px 10px", fontSize: 12, color: "var(--soft)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>
                  {l.payType === "monthly" ? "monthly" : l.payType === "daily" ? `${l.attendanceDays} day${l.attendanceDays === 1 ? "" : "s"}` : `${l.qualifyingBatches} batch`}
                  {l.batchIncentive > 0 ? ` · ${l.qualifyingBatches}✓ batches` : ""}
                </td>
                <td style={{ padding: "9px 10px", fontSize: 13, textAlign: "right", borderBottom: "1px solid var(--line)" }}>{rupiah(l.base)}</td>
                <td style={{ padding: "9px 10px", fontSize: 13, textAlign: "right", borderBottom: "1px solid var(--line)", color: "var(--soft)" }}>{l.batchIncentive ? rupiah(l.batchIncentive) : "—"}</td>
                <td style={{ padding: "9px 10px", fontSize: 13, textAlign: "right", borderBottom: "1px solid var(--line)", color: "var(--soft)" }}>{rupiah(l.thrAccrual)}</td>
                <td style={{ padding: "9px 10px", fontSize: 13, textAlign: "right", borderBottom: "1px solid var(--line)", fontWeight: 800 }}>{rupiah(l.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ padding: "9px 10px", fontSize: 12, color: "var(--soft)" }}>THR accrued {rupiah(thrTotal)} (provision — not paid now)</td>
              <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", fontWeight: 800, color: "var(--soft)" }}>Total</td>
              <td style={{ padding: "9px 10px", fontSize: 14, textAlign: "right", fontWeight: 900 }}>{rupiah(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      {alreadyRun || done ? (
        <div style={{ padding: "10px 14px", background: "var(--tint-success)", border: "1.5px solid var(--green)", borderRadius: 12, fontSize: 13.5, color: "var(--ink)", fontWeight: 700 }}>✓ Payroll for {period} has been run — {rupiah(total)} posted to the cash ledger.</div>
      ) : (
        <button onClick={run} disabled={busy || preview.length === 0} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Running…" : `Run payroll · ${rupiah(total)}`}
        </button>
      )}

      {runs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", margin: "6px 0" }}>PAST RUNS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {runs.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink)", padding: "4px 0" }}>
                <span><strong>{r.period}</strong> <span style={{ color: "var(--soft)" }}>· {r.staffCount} staff · {r.status}</span></span>
                <strong>{rupiah(r.total)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamPanel({ staff, preview, period, total, thrTotal, alreadyRun, runs, today }: {
  staff: StaffRow[];
  preview: PayrollPreviewLine[];
  period: string;
  total: number;
  thrTotal: number;
  alreadyRun: boolean;
  runs: PayrollRunRow[];
  today: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <StaffSection staff={staff} today={today} />
      <PayrollSection preview={preview} period={period} total={total} thrTotal={thrTotal} alreadyRun={alreadyRun} runs={runs} />
    </div>
  );
}
