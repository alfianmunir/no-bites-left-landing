import type { StaffPayment, StaffPaymentSummary } from "@/lib/opsStore";
import { rupiah } from "../OpsChrome";

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };

/** Human label + tone for a pay row's type. Accruals are amounts owed but not
 *  yet disbursed (salary/THR); wages are cash already paid out. */
function payTypeLabel(t: string): string {
  if (t === "wage") return "Wage";
  if (t === "salary_accrual") return "Salary (accrued)";
  if (t === "thr_accrual") return "THR (accrued)";
  return t;
}

function StatMini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: "var(--soft)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}

function PaymentList({ payments }: { payments: StaffPayment[] }) {
  if (payments.length === 0) {
    return <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No payments yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {payments.map((pm) => (
        <div
          key={pm.expenseId}
          style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 900, fontSize: 15, color: "var(--ink)" }}>{rupiah(pm.amount)}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", padding: "2px 8px", borderRadius: 999, background: "var(--surface2)", border: "1.5px solid var(--line)" }}>
                {payTypeLabel(pm.payType)}
              </span>
            </div>
            {pm.note && <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pm.note}</div>}
            <div style={{ fontSize: 11.5, color: "var(--soft)", marginTop: 2 }}>{pm.payDate?.slice(0, 10)}</div>
          </div>
          {pm.paid ? (
            <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 900, color: "var(--green)", padding: "5px 11px", borderRadius: 999, background: "var(--tint-success)", border: "1.5px solid var(--green)" }}>✓ Paid</span>
          ) : (
            <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 900, color: "#d98b1e", padding: "5px 11px", borderRadius: 999, background: "#fff6e8", border: "1.5px solid #d98b1e" }}>Owed</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Staff view: one member's summary + their payment history. */
export function MyPaySelf({ summary, payments }: { summary: StaffPaymentSummary | null; payments: StaffPayment[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <StatMini label="Earned" value={rupiah(summary?.totalEarned ?? 0)} />
        <StatMini label="Paid" value={rupiah(summary?.totalPaid ?? 0)} tone="var(--green)" />
        <StatMini label="Owed" value={rupiah(summary?.balanceOwed ?? 0)} tone={(summary?.balanceOwed ?? 0) > 0 ? "#d98b1e" : "var(--ink)"} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "var(--soft)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Payments</div>
        <PaymentList payments={payments} />
      </div>
    </div>
  );
}

/** Admin view: every staff member, each with their summary + payments. */
export function MyPayAll({ summaries, payments }: { summaries: StaffPaymentSummary[]; payments: StaffPayment[] }) {
  const byStaff = new Map<string, StaffPayment[]>();
  for (const pm of payments) {
    const arr = byStaff.get(pm.staffId) ?? [];
    arr.push(pm);
    byStaff.set(pm.staffId, arr);
  }
  if (summaries.length === 0) {
    return <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No staff pay records yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {summaries.map((s) => (
        <div key={s.staffId} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, fontSize: 17, color: "var(--choco)" }}>{s.staffName}</div>
            <div style={{ fontSize: 12.5, color: "var(--soft)", fontWeight: 700 }}>
              Earned {rupiah(s.totalEarned)} · Paid <span style={{ color: "var(--green)" }}>{rupiah(s.totalPaid)}</span> · Owed{" "}
              <span style={{ color: s.balanceOwed > 0 ? "#d98b1e" : "var(--ink)", fontWeight: 900 }}>{rupiah(s.balanceOwed)}</span>
            </div>
          </div>
          <PaymentList payments={byStaff.get(s.staffId) ?? []} />
        </div>
      ))}
    </div>
  );
}
