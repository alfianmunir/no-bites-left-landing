"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPct, type PnL } from "@/lib/opsFinance";
import { agingBucket, type AgingBucket } from "@/lib/opsOrderMath";
import type {
  CashPosition,
  CashEntryRow,
  ExpenseCategoryRow,
  BudgetRow,
  AssetRow,
  PayablePurchaseRow,
  InvoiceRow,
} from "@/lib/opsStore";

function rupiah(n: number): string {
  const s = "Rp " + Math.round(Math.abs(n)).toLocaleString("id-ID");
  return n < 0 ? "−" + s : s;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  fontSize: 14, background: "#fff", color: "var(--ink)",
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em", marginBottom: 4, display: "block" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 };

const ACCOUNT_LABEL: Record<string, string> = {
  cash: "Cash", bank: "Bank", marketplace_pending: "Marketplace (pending)",
};
const accountLabel = (a: string) => ACCOUNT_LABEL[a] ?? a;

const ACCOUNT_OPTIONS = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
];

type SubTab = "overview" | "ledger" | "expense" | "budgets" | "assets" | "payables";

const BUCKET_COLOR: Record<AgingBucket, string> = {
  paid: "var(--green)", current: "var(--soft)", "1-30": "var(--orange)", "31-60": "var(--orange)", "60+": "var(--red)",
};

// ============================================================ Overview
function Overview({ position, pnl, monthLabel }: { position: CashPosition; pnl: PnL; monthLabel: string }) {
  const pnlRows: Array<{ k: string; v: number; strong?: boolean; muted?: boolean; neg?: boolean }> = [
    { k: "Revenue (net of fees)", v: pnl.revenue },
    { k: "− COGS", v: -pnl.cogs, neg: true },
    { k: "Gross profit", v: pnl.grossProfit, strong: true },
    { k: "− Opex", v: -pnl.opex, neg: true },
    { k: "− Marketing", v: -pnl.marketing, neg: true },
    { k: "− Depreciation", v: -pnl.depreciation, neg: true },
    { k: "Operating profit", v: pnl.operatingProfit, strong: true },
  ];
  const grossMargin = pnl.revenue > 0 ? pnl.grossProfit / pnl.revenue : NaN;
  const opMargin = pnl.revenue > 0 ? pnl.operatingProfit / pnl.revenue : NaN;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Cash position cards */}
      <div>
        <div style={sectionLabel}>CASH POSITION</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <div style={{ ...card, background: "var(--choco)", border: "none" }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em" }}>TOTAL</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4 }}>{rupiah(position.total)}</div>
          </div>
          {position.accounts.map((a) => (
            <div key={a.account} style={card}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.04em" }}>{accountLabel(a.account).toUpperCase()}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: a.balance < 0 ? "var(--red)" : "var(--ink)", marginTop: 4 }}>{rupiah(a.balance)}</div>
            </div>
          ))}
          {position.accounts.length === 0 && (
            <div style={{ ...card, color: "var(--soft)", fontSize: 13 }}>No cash movements yet.</div>
          )}
        </div>
      </div>

      {/* P&L */}
      <div>
        <div style={sectionLabel}>P&amp;L · {monthLabel.toUpperCase()}</div>
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {pnlRows.map((r) => (
            <div key={r.k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--line)", background: r.strong ? "var(--surface2)" : "#fff" }}>
              <span style={{ fontSize: 13.5, fontWeight: r.strong ? 900 : 600, color: r.strong ? "var(--choco)" : "var(--soft)" }}>{r.k}</span>
              <span style={{ fontSize: 13.5, fontWeight: r.strong ? 900 : 700, color: r.strong ? (r.v < 0 ? "var(--red)" : "var(--choco)") : r.neg ? "var(--red)" : "var(--ink)" }}>{rupiah(r.v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 18, padding: "11px 16px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--soft)" }}>Gross margin <strong style={{ color: "var(--ink)" }}>{formatPct(grossMargin)}</strong></span>
            <span style={{ fontSize: 12.5, color: "var(--soft)" }}>Operating margin <strong style={{ color: opMargin < 0 ? "var(--red)" : "var(--ink)" }}>{formatPct(opMargin)}</strong></span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 8, lineHeight: 1.5 }}>
          Accrual view — revenue books when an order is recorded (website auto-posting activates with the payment-gateway trigger). Cash figures above reflect posted ledger movements only.
        </div>
      </div>
    </div>
  );
}

// ============================================================ Ledger
function Ledger({ entries, monthLabel }: { entries: CashEntryRow[]; monthLabel: string }) {
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [account, setAccount] = useState("");
  const shown = entries.filter((e) => (!direction || e.direction === direction) && (!account || e.account === account));
  const accounts = Array.from(new Set(entries.map((e) => e.account)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>Direction</label>
          <select style={{ ...inputStyle, width: "auto" }} value={direction} onChange={(e) => setDirection(e.target.value as "" | "in" | "out")}>
            <option value="">All</option>
            <option value="in">In</option>
            <option value="out">Out</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Account</label>
          <select style={{ ...inputStyle, width: "auto" }} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All</option>
            {accounts.map((a) => <option key={a} value={a}>{accountLabel(a)}</option>)}
          </select>
        </div>
      </div>

      <div style={sectionLabel}>{monthLabel.toUpperCase()} · {shown.length} {shown.length === 1 ? "entry" : "entries"}</div>
      {shown.length === 0 ? (
        <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No cash entries for this month.</div>
      ) : (
        <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <thead>
              <tr>
                {["Date", "Category", "Account", "In", "Out", "Balance"].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--soft)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{e.occurredAt.slice(0, 10)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", fontWeight: 700 }}>
                    {e.category}
                    {e.note && <span style={{ color: "var(--soft)", fontWeight: 500 }}> · {e.note}</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--soft)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{accountLabel(e.account)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", textAlign: "right", color: "var(--green)", fontWeight: 700 }}>{e.direction === "in" ? rupiah(e.amount) : ""}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", textAlign: "right", color: "var(--red)", fontWeight: 700 }}>{e.direction === "out" ? rupiah(e.amount) : ""}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", textAlign: "right", fontWeight: 800, color: e.balance < 0 ? "var(--red)" : "var(--ink)" }}>{rupiah(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--soft)" }}>Balance is the running net across the rows shown, oldest to newest.</div>
    </div>
  );
}

// ============================================================ Expense entry
function ExpenseEntry({ categories }: { categories: ExpenseCategoryRow[] }) {
  const router = useRouter();
  // Default to the first opex tag (routine spend), not the alphabetically-first
  // capex one — so the capex hint doesn't greet an empty form.
  const [categoryId, setCategoryId] = useState((categories.find((c) => c.type === "opex") ?? categories[0])?.id ?? "");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [campaignRef, setCampaignRef] = useState("");
  const [account, setAccount] = useState("bank");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const cat = categories.find((c) => c.id === categoryId);
  const isMarketing = cat?.type === "marketing";
  const isCapex = cat?.type === "capex";

  const grouped: Array<{ type: string; label: string; items: ExpenseCategoryRow[] }> = [
    { type: "opex", label: "Opex", items: categories.filter((c) => c.type === "opex") },
    { type: "marketing", label: "Marketing", items: categories.filter((c) => c.type === "marketing") },
    { type: "capex", label: "Capex", items: categories.filter((c) => c.type === "capex") },
  ].filter((g) => g.items.length > 0);

  const submit = async () => {
    setError(null); setDone(null);
    if (!categoryId) return setError("Select a category.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter an amount greater than 0.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, amount: amt, vendor: vendor || null, note: note || null, campaignRef: campaignRef || null, occurredAt: occurredAt || null, recurring, account }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not record the expense.");
      else {
        setDone(`Recorded ${rupiah(amt)} — cash out from ${accountLabel(account)}.`);
        setAmount(""); setVendor(""); setNote(""); setCampaignRef("");
        router.refresh();
      }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>New expense</div>
      {done && <div style={{ padding: "10px 14px", background: "var(--tint-success)", border: "1.5px solid var(--green)", borderRadius: 12, fontSize: 13.5, color: "var(--ink)", fontWeight: 700 }}>✓ {done}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {grouped.map((g) => (
              <optgroup key={g.type} label={g.label}>
                {g.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Amount (Rp)</label>
          <input type="number" inputMode="numeric" min="0" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Vendor</label>
          <input style={inputStyle} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="who was paid" />
        </div>
        <div>
          <label style={labelStyle}>Pay from</label>
          <select style={inputStyle} value={account} onChange={(e) => setAccount(e.target.value)}>
            {ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" style={inputStyle} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        {isMarketing && (
          <div>
            <label style={labelStyle}>Campaign ref</label>
            <input style={inputStyle} value={campaignRef} onChange={(e) => setCampaignRef(e.target.value)} placeholder="for ROAS matching" />
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Note</label>
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional detail" />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} /> Recurring (rent, subscription…)
      </label>

      {isCapex && (
        <div style={{ fontSize: 12, color: "var(--soft)", lineHeight: 1.5 }}>
          Capex hits cash now but not the P&amp;L — big equipment should be added to the <strong>Assets</strong> tab instead, so it depreciates monthly.
        </div>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Saving…" : "Record expense"}
      </button>
    </div>
  );
}

// ============================================================ Budgets
function Budgets({ budgets, monthLabel }: { budgets: BudgetRow[]; monthLabel: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={sectionLabel}>MARKETING BUDGET vs SPEND · {monthLabel.toUpperCase()}</div>
      {budgets.length === 0 ? (
        <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No budgeted marketing tags.</div>
      ) : (
        budgets.map((b) => {
          const pct = b.monthlyBudget > 0 ? b.spent / b.monthlyBudget : 0;
          const over = b.spent > b.monthlyBudget;
          const barColor = over ? "var(--red)" : pct > 0.85 ? "var(--orange)" : "var(--green)";
          return (
            <div key={b.code} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>{b.name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: over ? "var(--red)" : "var(--ink)" }}>
                  {rupiah(b.spent)} <span style={{ color: "var(--soft)", fontWeight: 600 }}>/ {rupiah(b.monthlyBudget)}</span>
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, pct * 100)}%`, background: barColor, borderRadius: 999 }} />
              </div>
              {over && <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700, marginTop: 6 }}>Over budget by {rupiah(b.spent - b.monthlyBudget)}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================ Assets
function AssetItem({ asset }: { asset: AssetRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(asset.purchaseCost != null ? String(Math.round(asset.purchaseCost)) : "");
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState("bank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markOwned = async () => {
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, purchaseCost: cost === "" ? null : Number(cost), purchasedAt, account }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not update the asset.");
      else { setOpen(false); router.refresh(); }
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const statusColor = asset.status === "owned" ? "var(--green)" : asset.status === "planned" ? "var(--orange)" : "var(--soft)";

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{asset.name} <span style={{ fontSize: 11.5, fontWeight: 800, color: statusColor, textTransform: "uppercase" }}>· {asset.status}</span></div>
          <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>
            {asset.category}
            {asset.purchaseCost != null && <> · {rupiah(asset.purchaseCost)}</>}
            {asset.status === "owned" && asset.monthlyDepreciation > 0 && <> · {rupiah(asset.monthlyDepreciation)}/mo depreciation</>}
            {asset.status === "planned" && asset.targetMonth && <> · target {asset.targetMonth.slice(0, 7)}</>}
          </div>
        </div>
        {asset.status === "planned" && (
          <button onClick={() => setOpen((o) => !o)} style={{ padding: "6px 14px", borderRadius: 999, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
            {open ? "Cancel" : "Mark bought"}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Actual cost (Rp)</label>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Bought on</label>
              <input type="date" style={inputStyle} value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Pay from</label>
              <select style={inputStyle} value={account} onChange={(e) => setAccount(e.target.value)}>
                {ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <button onClick={markOwned} disabled={busy} style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Saving…" : "Confirm purchase (posts capex cash-out)"}
          </button>
        </div>
      )}
    </div>
  );
}

function Assets({ assets }: { assets: AssetRow[] }) {
  const owned = assets.filter((a) => a.status === "owned");
  const monthlyDep = owned.reduce((s, a) => s + a.monthlyDepreciation, 0);
  const plannedCost = assets.filter((a) => a.status === "planned").reduce((s, a) => s + (a.purchaseCost ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--soft)" }}>
        <span>Monthly depreciation <strong style={{ color: "var(--ink)" }}>{rupiah(monthlyDep)}</strong></span>
        {plannedCost > 0 && <span>Planned capex <strong style={{ color: "var(--ink)" }}>{rupiah(plannedCost)}</strong></span>}
      </div>
      <div style={sectionLabel}>ASSET REGISTER · {assets.length}</div>
      {assets.length === 0 ? (
        <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No assets.</div>
      ) : (
        assets.map((a) => <AssetItem key={a.id} asset={a} />)
      )}
    </div>
  );
}

// ============================================================ Payables (AP) + AR
function PayableItem({ purchase }: { purchase: PayablePurchaseRow }) {
  const router = useRouter();
  const [account, setAccount] = useState("bank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/purchase/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId: purchase.id, account }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not mark paid.");
      else router.refresh();
    } catch {
      setError("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
      <div style={{ fontSize: 13 }}>
        <span style={{ fontWeight: 800 }}>{purchase.supplierName || "Supplier"}</span>
        <span style={{ color: "var(--soft)" }}> · {purchase.invoiceRef || purchase.id.slice(0, 6)}{purchase.receivedAt ? ` · recv ${purchase.receivedAt}` : ""}{purchase.dueDate ? ` · due ${purchase.dueDate}` : ""}</span>
        {error && <div style={{ color: "var(--red)", fontSize: 12, fontWeight: 700, marginTop: 3 }}>{error}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>{rupiah(purchase.total)}</span>
        <select style={{ ...inputStyle, width: "auto", padding: "6px 8px", fontSize: 12.5 }} value={account} onChange={(e) => setAccount(e.target.value)}>
          {ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <button onClick={pay} disabled={busy} style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12, cursor: busy ? "default" : "pointer" }}>{busy ? "…" : "Mark paid"}</button>
      </div>
    </div>
  );
}

function Payables({ payables, invoices, today }: { payables: PayablePurchaseRow[]; invoices: InvoiceRow[]; today: string }) {
  const payableTotal = payables.reduce((s, p) => s + p.total, 0);
  const openInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const arTotal = openInvoices.reduce((s, i) => s + i.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={sectionLabel}>ACCOUNTS PAYABLE (received, unpaid) · {rupiah(payableTotal)}</div>
        {payables.length === 0 ? (
          <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>Nothing to pay — all received purchases are settled.</div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {payables.map((p) => <PayableItem key={p.id} purchase={p} />)}
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabel}>ACCOUNTS RECEIVABLE (B2B) · {openInvoices.length} open · {rupiah(arTotal)}</div>
        {invoices.length === 0 ? (
          <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No B2B invoices. Mark a B2B invoice paid on the Orders tab — it posts a cash-in here.</div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {invoices.map((inv) => {
              const bucket = agingBucket(inv.status, inv.dueDate, today);
              return (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 800 }}>{inv.customerRef || "—"}</span>
                    <span style={{ color: "var(--soft)" }}> · {inv.number ?? inv.salesOrderId.slice(0, 6)} · due {inv.dueDate ?? "—"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 13.5 }}>{rupiah(inv.amount)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: BUCKET_COLOR[bucket] }}>{inv.status === "paid" ? "paid" : bucket === "current" ? "current" : `${bucket}d overdue`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 8 }}>Invoices are settled on the Orders tab (Mark paid) — that posts the cash-in to Bank.</div>
      </div>
    </div>
  );
}

// ============================================================ Panel
const TABS: Array<{ key: SubTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "ledger", label: "Cash ledger" },
  { key: "expense", label: "Expense" },
  { key: "budgets", label: "Budgets" },
  { key: "assets", label: "Assets" },
  { key: "payables", label: "AP / AR" },
];

export default function MoneyPanel({
  position,
  entries,
  categories,
  budgets,
  assets,
  payables,
  invoices,
  pnl,
  monthLabel,
  today,
}: {
  position: CashPosition;
  entries: CashEntryRow[];
  categories: ExpenseCategoryRow[];
  budgets: BudgetRow[];
  assets: AssetRow[];
  payables: PayablePurchaseRow[];
  invoices: InvoiceRow[];
  pnl: PnL;
  monthLabel: string;
  today: string;
}) {
  const [tab, setTab] = useState<SubTab>("overview");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap",
                border: `1.5px solid ${on ? "var(--choco)" : "var(--line)"}`, cursor: "pointer",
                background: on ? "var(--choco)" : "#fff", color: on ? "#fff" : "var(--soft)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <Overview position={position} pnl={pnl} monthLabel={monthLabel} />}
      {tab === "ledger" && <Ledger entries={entries} monthLabel={monthLabel} />}
      {tab === "expense" && <ExpenseEntry categories={categories} />}
      {tab === "budgets" && <Budgets budgets={budgets} monthLabel={monthLabel} />}
      {tab === "assets" && <Assets assets={assets} />}
      {tab === "payables" && <Payables payables={payables} invoices={invoices} today={today} />}
    </div>
  );
}
