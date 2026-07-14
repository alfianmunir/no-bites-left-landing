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
  ItemDetailRow,
  ProductRow,
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
    { k: "Revenue (gross)", v: pnl.revenue },
    { k: "− COGS", v: -pnl.cogs, neg: true },
    { k: "Gross profit", v: pnl.grossProfit, strong: true },
    { k: "− Channel / PG fees", v: -pnl.fees, neg: true },
    { k: "− Labor (non-prod)", v: -pnl.labor, neg: true },
    { k: "− Opex", v: -pnl.opex, neg: true },
    { k: "− Marketing", v: -pnl.marketing, neg: true },
    { k: "− Samples / KOL", v: -pnl.samples, neg: true },
    { k: "− R&D", v: -pnl.rnd, neg: true },
    { k: "− Waste", v: -pnl.waste, neg: true },
    { k: "− Shrinkage", v: -pnl.shrinkage, neg: true },
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

// ============================================================ Outbound / write-off
type OutKind = "item" | "product" | "other";
const OUT_KINDS: Array<{ value: OutKind; label: string }> = [
  { value: "item", label: "Items" },
  { value: "product", label: "Finished goods" },
  { value: "other", label: "Other" },
];
const OTHER_CATEGORY = "__other__";

/** Outbound / write-off flow. Burns a raw item, a finished good, or a manual
 *  "other" amount, attributed to a chosen expense category (grouped by budget
 *  type, or "Other"). Items & finished goods were already paid for on purchase,
 *  so they post as a NON-CASH cost (stock ledger move + expense, no cash entry);
 *  "Other" is fresh money and posts a cash-out from the chosen account. */
function OutboundEntry({ items, products, categories }: { items: ItemDetailRow[]; products: ProductRow[]; categories: ExpenseCategoryRow[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<OutKind>("item");
  const [itemId, setItemId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState((categories.find((c) => c.code === "mkt_rnd_tester") ?? categories.find((c) => c.type === "opex") ?? categories[0])?.id ?? "");
  const [otherLabel, setOtherLabel] = useState("");
  const [account, setAccount] = useState("bank");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const item = items.find((i) => i.id === itemId);
  const product = products.find((p) => p.id === productId);
  const qtyNum = Number(qty) || 0;
  const amountNum = Number(amount) || 0;
  const estCost =
    kind === "item" ? (item ? item.avgCost * qtyNum : null)
    : kind === "product" ? (product ? product.stdCost * qtyNum : null)
    : amountNum;
  const overStock = kind === "item" && item != null && qtyNum > item.onHand;
  const isOther = kind === "other";

  const catGroups: Array<{ type: string; label: string; items: ExpenseCategoryRow[] }> = [
    { type: "opex", label: "Opex", items: categories.filter((c) => c.type === "opex") },
    { type: "marketing", label: "Marketing", items: categories.filter((c) => c.type === "marketing") },
    { type: "capex", label: "Capex", items: categories.filter((c) => c.type === "capex") },
  ].filter((g) => g.items.length > 0);

  const itemGroups: Array<{ type: string; label: string; items: ItemDetailRow[] }> = [
    { type: "ingredient", label: "Ingredients", items: items.filter((i) => i.type === "ingredient") },
    { type: "packaging", label: "Packaging", items: items.filter((i) => i.type === "packaging") },
  ].filter((g) => g.items.length > 0);

  const switchKind = (k: OutKind) => { setKind(k); setDone(null); setError(null); };

  const submit = async () => {
    setError(null); setDone(null);
    if (!categoryId) return setError("Select a category.");
    if (categoryId === OTHER_CATEGORY && !otherLabel.trim()) return setError("Name the 'Other' category.");
    if (kind === "item" && !itemId) return setError("Select an item.");
    if (kind === "product" && !productId) return setError("Select a finished good.");
    if ((kind === "item" || kind === "product") && (!Number.isFinite(qtyNum) || qtyNum <= 0)) return setError("Enter a quantity greater than 0.");
    if (kind === "other" && (!Number.isFinite(amountNum) || amountNum <= 0)) return setError("Enter an amount greater than 0.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, categoryId,
          otherLabel: categoryId === OTHER_CATEGORY ? otherLabel : null,
          itemId: kind === "item" ? itemId : null,
          productId: kind === "product" ? productId : null,
          qty: kind === "other" ? null : qtyNum,
          amount: kind === "other" ? amountNum : null,
          note: note || null,
          account,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not record the outbound.");
      else {
        const cost = typeof data.cost === "number" ? data.cost : estCost ?? 0;
        const what = kind === "item" ? `${qtyNum} ${item?.unit ?? ""} of ${item?.name ?? "item"}`
          : kind === "product" ? `${qtyNum} × ${product?.name ?? "product"}`
          : "amount";
        setDone(`Outbounded ${what} — ${rupiah(cost)} booked${isOther ? ` as cash out from ${accountLabel(account)}` : " (non-cash)"}.`);
        setItemId(""); setProductId(""); setQty(""); setAmount(""); setNote("");
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
      <div>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>Outbound / write-off</div>
        <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 2 }}>Send stock or spend out to a budget category — e.g. R&amp;D testing, samples, giveaways. Items &amp; finished goods deduct stock at cost (non-cash, already paid); &ldquo;Other&rdquo; posts a cash-out.</div>
      </div>
      {done && <div style={{ padding: "10px 14px", background: "var(--tint-success)", border: "1.5px solid var(--green)", borderRadius: 12, fontSize: 13.5, color: "var(--ink)", fontWeight: 700 }}>✓ {done}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        {OUT_KINDS.map((k) => (
          <button key={k.value} onClick={() => switchKind(k.value)} style={{
            flex: 1, padding: "9px 12px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
            border: `1.5px solid ${kind === k.value ? "var(--choco)" : "var(--line)"}`,
            background: kind === k.value ? "var(--choco)" : "#fff",
            color: kind === k.value ? "#fff" : "var(--soft)",
          }}>{k.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {kind === "item" && (
          <div>
            <label style={labelStyle}>Item</label>
            <select style={inputStyle} value={itemId} onChange={(e) => { setItemId(e.target.value); setDone(null); }}>
              <option value="">— select from stock —</option>
              {itemGroups.map((g) => (
                <optgroup key={g.type} label={g.label}>
                  {g.items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.onHand} {i.unit} on hand</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        {kind === "product" && (
          <div>
            <label style={labelStyle}>Finished good</label>
            <select style={inputStyle} value={productId} onChange={(e) => { setProductId(e.target.value); setDone(null); }}>
              <option value="">— select product —</option>
              {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} ({pr.sku})</option>)}
            </select>
          </div>
        )}
        {(kind === "item" || kind === "product") && (
          <div>
            <label style={labelStyle}>Quantity{kind === "item" && item ? ` (${item.unit})` : ""}</label>
            <input type="number" inputMode="decimal" min="0" style={inputStyle} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </div>
        )}
        {kind === "other" && (
          <>
            <div>
              <label style={labelStyle}>Amount (Rp)</label>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Pay from</label>
              <select style={inputStyle} value={account} onChange={(e) => setAccount(e.target.value)}>
                {ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {catGroups.map((g) => (
              <optgroup key={g.type} label={g.label}>
                {g.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
            <option value={OTHER_CATEGORY}>Other…</option>
          </select>
        </div>
        {categoryId === OTHER_CATEGORY && (
          <div>
            <label style={labelStyle}>Other category name</label>
            <input style={inputStyle} value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} placeholder="what is this for?" />
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Note</label>
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. matcha ratio trial, tester box, event sampling" />
      </div>

      {estCost != null && (isOther ? amountNum > 0 : qtyNum > 0) && (
        <div style={{ fontSize: 12.5, color: "var(--soft)" }}>
          {isOther ? <>Books {rupiah(estCost)} as a cash-out.</> : <>Est. cost {rupiah(estCost)} <span style={{ opacity: 0.7 }}>({kind === "item" ? "avg" : "std"} cost × qty · non-cash)</span></>}
        </div>
      )}
      {overStock && <div style={{ fontSize: 12.5, color: "var(--orange)", fontWeight: 700 }}>Heads up — that&apos;s more than the {item?.onHand} {item?.unit} on hand; it will post as no-lot stock at avg cost.</div>}
      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}

      <button onClick={submit} disabled={busy} style={{ alignSelf: "flex-start", padding: "12px 22px", borderRadius: 12, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 14.5, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Saving…" : "Record outbound"}
      </button>
    </div>
  );
}

// ============================================================ Budgets
const BUDGET_TYPES = [
  { value: "opex", label: "Opex" },
  { value: "marketing", label: "Marketing" },
  { value: "capex", label: "Capex" },
];

async function postBudget(body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/ops/budget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, error: d.error };
}

function CategoryRowEdit({ cat }: { cat: ExpenseCategoryRow }) {
  const router = useRouter();
  const [name, setName] = useState(cat.name);
  const [budget, setBudget] = useState(cat.monthlyBudget == null ? "" : String(cat.monthlyBudget));
  const [inkind, setInkind] = useState(cat.countInkind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== cat.name || (budget === "" ? null : Number(budget)) !== cat.monthlyBudget;

  const toggleInkind = async () => {
    const next = !inkind;
    setInkind(next); // optimistic
    setBusy(true);
    setError(null);
    const { ok, error } = await postBudget({ action: "update", id: cat.id, countInkind: next });
    setBusy(false);
    if (!ok) { setInkind(!next); setError(error ?? "failed"); return; }
    router.refresh();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const { ok, error } = await postBudget({ action: "update", id: cat.id, name: name.trim(), monthlyBudget: budget === "" ? null : Number(budget) });
    setBusy(false);
    if (!ok) { setError(error ?? "failed"); return; }
    router.refresh();
  };
  const del = async () => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setBusy(true);
    setError(null);
    const { ok, error } = await postBudget({ action: "delete", id: cat.id });
    setBusy(false);
    if (!ok) { setError(error ?? "failed"); return; }
    router.refresh();
  };

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--soft)", width: 90 }}>{cat.code}</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: cat.type === "marketing" ? "var(--orange)" : cat.type === "capex" ? "var(--choco)" : "var(--soft)", borderRadius: 999, padding: "2px 8px" }}>{cat.type}</span>
        <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="category name" />
        <input type="number" inputMode="numeric" min="0" style={{ ...inputStyle, width: 120 }} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="no budget" aria-label="monthly budget" />
        {dirty && <button onClick={save} disabled={busy} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>}
        <button onClick={del} disabled={busy} aria-label="delete category" style={{ border: "none", background: "transparent", color: "var(--red)", fontSize: 15, cursor: "pointer" }}>🗑</button>
      </div>
      {cat.type === "marketing" && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, marginLeft: 98, fontSize: 12, color: "var(--soft)", fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
          <input type="checkbox" checked={inkind} disabled={busy} onChange={toggleInkind} />
          Count in-kind giveaways (sample/KOL/R&D made-cost) against this budget
        </label>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function AddCategory() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("opex");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    const { ok, error } = await postBudget({ action: "create", code: code.trim(), name: name.trim(), type, monthlyBudget: budget === "" ? null : Number(budget) });
    setBusy(false);
    if (!ok) { setError(error ?? "failed"); return; }
    setCode(""); setName(""); setBudget("");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input style={{ ...inputStyle, width: 130 }} value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="code (mkt_ads)" />
        <select style={{ ...inputStyle, width: "auto" }} value={type} onChange={(e) => setType(e.target.value)}>
          {BUDGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
        <input type="number" inputMode="numeric" min="0" style={{ ...inputStyle, width: 120 }} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="budget (opt.)" />
        <button onClick={add} disabled={busy || !code.trim() || !name.trim()} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>+ Add</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

function Budgets({ budgets, categories, monthLabel }: { budgets: BudgetRow[]; categories: ExpenseCategoryRow[]; monthLabel: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={sectionLabel}>BUDGET vs SPEND · {monthLabel.toUpperCase()}</div>
      {budgets.length === 0 ? (
        <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No budgeted categories yet — set a monthly budget below.</div>
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
              {b.inkindSpent > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--soft)", fontWeight: 700, marginTop: 6 }}>
                  {rupiah(b.cashSpent)} cash + {rupiah(b.inkindSpent)} in-kind giveaways
                </div>
              )}
              {over && <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700, marginTop: 6 }}>Over budget by {rupiah(b.spent - b.monthlyBudget)}</div>}
            </div>
          );
        })
      )}

      <div style={{ ...sectionLabel, marginTop: 8 }}>MANAGE CATEGORIES &amp; BUDGETS · {categories.length}</div>
      <div style={card}>
        {categories.map((c) => <CategoryRowEdit key={c.id} cat={c} />)}
        <AddCategory />
        <div style={{ fontSize: 11.5, color: "var(--soft)", marginTop: 10 }}>
          Leave budget empty for no monthly cap. Categories with recorded expenses can&apos;t be deleted (ledger history) — clear the budget instead.
        </div>
      </div>
    </div>
  );
}

// ============================================================ Assets
const CATEGORY_OPTIONS = [
  { value: "production", label: "Production" },
  { value: "storage", label: "Storage" },
  { value: "other", label: "Other" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

async function postAsset(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/ops/asset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error };
}

function AddAsset() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("production");
  const [status, setStatus] = useState("planned");
  const [cost, setCost] = useState("");
  const [targetMonth, setTargetMonth] = useState("");
  const [life, setLife] = useState("48");
  const [salvage, setSalvage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    setBusy(true);
    const { ok, error } = await postAsset({
      action: "create", name, category, status,
      purchaseCost: cost === "" ? null : Number(cost),
      targetMonth: status === "planned" && targetMonth ? targetMonth + "-01" : null,
      usefulLifeMonths: life === "" ? null : Number(life),
      salvageValue: salvage === "" ? 0 : Number(salvage),
    });
    setBusy(false);
    if (!ok) setError(error ?? "Could not add the asset.");
    else { setName(""); setCost(""); setTargetMonth(""); setSalvage(""); setStatus("planned"); setOpen(false); router.refresh(); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: 999, border: "1.5px solid var(--choco)", background: "#fff", color: "var(--choco)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>+ Add asset</button>
    );
  }
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10, background: "var(--surface2)" }}>
      <div style={{ fontWeight: 900, fontSize: 14, color: "var(--choco)" }}>New asset</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 10 }}>
        <div><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Display chiller" /></div>
        <div><label style={labelStyle}>Category</label>
          <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </div>
        <div><label style={labelStyle}>Status</label>
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planned">Planned</option>
            <option value="owned">Owned (already have)</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        <div><label style={labelStyle}>{status === "owned" ? "Cost (Rp)" : "Est. cost (Rp)"}</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        {status === "planned" ? (
          <div><label style={labelStyle}>Target month</label><input type="month" style={inputStyle} value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} /></div>
        ) : <div />}
        <div><label style={labelStyle}>Life (months)</label><input type="number" inputMode="numeric" min="1" style={inputStyle} value={life} onChange={(e) => setLife(e.target.value)} /></div>
        <div><label style={labelStyle}>Salvage (Rp)</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={salvage} onChange={(e) => setSalvage(e.target.value)} placeholder="0" /></div>
      </div>
      {status === "owned" && <div style={{ fontSize: 11.5, color: "var(--soft)" }}>Registering an owned asset does <strong>not</strong> post a cash-out (assumed already paid). To buy a planned asset with a cash-out, add it as Planned then “Mark bought”.</div>}
      {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={submit} disabled={busy} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>{busy ? "Saving…" : "Add asset"}</button>
        <button onClick={() => { setOpen(false); setError(null); }} style={{ border: "none", background: "transparent", color: "var(--soft)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function AssetItem({ asset }: { asset: AssetRow }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "buy" | "edit">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // buy state
  const [cost, setCost] = useState(asset.purchaseCost != null ? String(Math.round(asset.purchaseCost)) : "");
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState("bank");
  // edit state
  const [eName, setEName] = useState(asset.name);
  const [eCategory, setECategory] = useState(asset.category);
  const [eCost, setECost] = useState(asset.purchaseCost != null ? String(Math.round(asset.purchaseCost)) : "");
  const [eTarget, setETarget] = useState(asset.targetMonth ? asset.targetMonth.slice(0, 7) : "");
  const [eLife, setELife] = useState(asset.usefulLifeMonths != null ? String(asset.usefulLifeMonths) : "48");
  const [eSalvage, setESalvage] = useState(asset.salvageValue ? String(Math.round(asset.salvageValue)) : "");

  const run = async (body: Record<string, unknown>, onOk?: () => void) => {
    setError(null); setBusy(true);
    const { ok, error } = await postAsset(body);
    setBusy(false);
    if (!ok) setError(error ?? "Could not update the asset.");
    else { onOk?.(); router.refresh(); }
  };

  const markOwned = () => run({ assetId: asset.id, purchaseCost: cost === "" ? null : Number(cost), purchasedAt, account }, () => setMode(null));
  const saveEdit = () => run({
    action: "update", assetId: asset.id, name: eName, category: eCategory,
    purchaseCost: eCost === "" ? null : Number(eCost),
    targetMonth: eTarget ? eTarget + "-01" : null,
    usefulLifeMonths: eLife === "" ? null : Number(eLife),
    salvageValue: eSalvage === "" ? 0 : Number(eSalvage),
  }, () => setMode(null));
  const dispose = () => { if (confirm(`Dispose ${asset.name}? It stops depreciating (kept for records).`)) run({ action: "dispose", assetId: asset.id }); };
  const remove = () => { if (confirm(`Delete ${asset.name}? This can't be undone.`)) run({ action: "delete", assetId: asset.id }); };

  const statusColor = asset.status === "owned" ? "var(--green)" : asset.status === "planned" ? "var(--orange)" : "var(--soft)";
  const btn = { padding: "6px 12px", borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" } as React.CSSProperties;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{asset.name} <span style={{ fontSize: 11.5, fontWeight: 800, color: statusColor, textTransform: "uppercase" }}>· {asset.status}</span></div>
          <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>
            {CATEGORY_LABEL[asset.category] ?? asset.category}
            {asset.purchaseCost != null && <> · {rupiah(asset.purchaseCost)}</>}
            {asset.status === "owned" && asset.monthlyDepreciation > 0 && <> · {rupiah(asset.monthlyDepreciation)}/mo depreciation</>}
            {asset.status === "planned" && asset.targetMonth && <> · target {asset.targetMonth.slice(0, 7)}</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {asset.status === "planned" && (
            <button onClick={() => setMode(mode === "buy" ? null : "buy")} style={{ ...btn, border: "1.5px solid var(--choco)", color: "var(--choco)" }}>{mode === "buy" ? "Cancel" : "Mark bought"}</button>
          )}
          <button onClick={() => setMode(mode === "edit" ? null : "edit")} style={{ ...btn, color: "var(--choco)" }}>{mode === "edit" ? "Close" : "Edit"}</button>
          {asset.status === "owned" && <button onClick={dispose} disabled={busy} style={{ ...btn, color: "var(--soft)" }}>Dispose</button>}
          {asset.status !== "owned" && <button onClick={remove} disabled={busy} style={{ ...btn, color: "var(--red)" }}>Delete</button>}
        </div>
      </div>

      {mode === "buy" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Actual cost (Rp)</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value)} /></div>
            <div><label style={labelStyle}>Bought on</label><input type="date" style={inputStyle} value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} /></div>
            <div><label style={labelStyle}>Pay from</label><select style={inputStyle} value={account} onChange={(e) => setAccount(e.target.value)}>{ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <button onClick={markOwned} disabled={busy} style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>{busy ? "Saving…" : "Confirm purchase (posts capex cash-out)"}</button>
        </div>
      )}

      {mode === "edit" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Name</label><input style={inputStyle} value={eName} onChange={(e) => setEName(e.target.value)} /></div>
            <div><label style={labelStyle}>Category</label><select style={inputStyle} value={eCategory} onChange={(e) => setECategory(e.target.value)}>{CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Cost (Rp)</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={eCost} onChange={(e) => setECost(e.target.value)} /></div>
            <div><label style={labelStyle}>Target month</label><input type="month" style={inputStyle} value={eTarget} onChange={(e) => setETarget(e.target.value)} /></div>
            <div><label style={labelStyle}>Life (months)</label><input type="number" inputMode="numeric" min="1" style={inputStyle} value={eLife} onChange={(e) => setELife(e.target.value)} /></div>
            <div><label style={labelStyle}>Salvage (Rp)</label><input type="number" inputMode="numeric" min="0" style={inputStyle} value={eSalvage} onChange={(e) => setESalvage(e.target.value)} placeholder="0" /></div>
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
          <button onClick={saveEdit} disabled={busy} style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 10, border: "none", background: busy ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 900, fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      )}

      {mode == null && error && <div style={{ marginTop: 8, color: "var(--red)", fontSize: 13, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

/** Monthly close → post the period's depreciation as a non-cash opex row (H3).
 *  Idempotent server-side: a second click reports it's already posted. */
function DepreciationClose({ monthLabel, monthlyDep }: { monthLabel: string; monthlyDep: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const close = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/ops/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) setMsg(data.error ?? "Could not post depreciation.");
      else {
        setMsg(data.posted ? `Posted ${rupiah(data.amount)} depreciation for ${monthLabel}.` : `Depreciation for ${monthLabel} is already posted.`);
        router.refresh();
      }
    } catch {
      setMsg("Request failed — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 13, color: "var(--soft)" }}>
        Monthly close — post <strong style={{ color: "var(--ink)" }}>{rupiah(monthlyDep)}</strong> depreciation to the P&amp;L for {monthLabel} (non-cash).
        {msg && <div style={{ color: "var(--choco)", fontWeight: 700, marginTop: 4 }}>{msg}</div>}
      </div>
      <button onClick={close} disabled={busy || monthlyDep <= 0} style={{ padding: "8px 14px", borderRadius: 999, border: "none", background: busy || monthlyDep <= 0 ? "var(--soft)" : "var(--choco)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: busy || monthlyDep <= 0 ? "default" : "pointer", whiteSpace: "nowrap" }}>
        {busy ? "Posting…" : "Post depreciation"}
      </button>
    </div>
  );
}

function Assets({ assets, monthLabel }: { assets: AssetRow[]; monthLabel: string }) {
  const owned = assets.filter((a) => a.status === "owned");
  const monthlyDep = owned.reduce((s, a) => s + a.monthlyDepreciation, 0);
  const plannedCost = assets.filter((a) => a.status === "planned").reduce((s, a) => s + (a.purchaseCost ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--soft)" }}>
        <span>Monthly depreciation <strong style={{ color: "var(--ink)" }}>{rupiah(monthlyDep)}</strong></span>
        {plannedCost > 0 && <span>Planned capex <strong style={{ color: "var(--ink)" }}>{rupiah(plannedCost)}</strong></span>}
      </div>
      <DepreciationClose monthLabel={monthLabel} monthlyDep={monthlyDep} />
      <AddAsset />
      <div style={sectionLabel}>ASSET REGISTER · {assets.length}</div>
      {assets.length === 0 ? (
        <div style={{ ...card, padding: 18, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No assets yet — add one above.</div>
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
  items,
  products,
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
  items: ItemDetailRow[];
  products: ProductRow[];
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
      {tab === "expense" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ExpenseEntry categories={categories} />
          <OutboundEntry items={items} products={products} categories={categories} />
        </div>
      )}
      {tab === "budgets" && <Budgets budgets={budgets} categories={categories} monthLabel={monthLabel} />}
      {tab === "assets" && <Assets assets={assets} monthLabel={monthLabel} />}
      {tab === "payables" && <Payables payables={payables} invoices={invoices} today={today} />}
    </div>
  );
}
