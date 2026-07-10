/**
 * /admin/ops/stock/ledger — the append-only Stock Movement Ledger.
 *
 * Every stock movement in one place: receipts, production consume/output, sales
 * draw-downs, opname adjustments, waste, and batch-cancel reversals — across both
 * ingredients/packaging (items) and finished goods (products). Newest first, with
 * filters by kind + reason and simple paging. Super-admin only (shows cost/value).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listStockLedger, countStockLedger, type StockLedgerKind, type StockLedgerRow } from "@/lib/opsStore";
import { OpsShell, DbNotice, rupiah, qty as fmtQty } from "../../OpsChrome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--soft)", borderBottom: "1.5px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13.5, color: "var(--ink)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };

// Friendly label + tone (in / out / neutral) for a raw stock move. opname_adj
// carries two flavours: real opname counts (ref_type 'opname') and the
// consumption reversal a cancelled batch posts (ref_type 'batch_cancel').
function meta(row: StockLedgerRow): { label: string; tone: "in" | "out" | "neutral" } {
  const { reason, refType, qty } = row;
  switch (reason) {
    case "purchase": return { label: "Received", tone: "in" };
    case "production_output": return { label: "Produced", tone: "in" };
    case "sale": return { label: "Sold", tone: "out" };
    case "waste": return { label: "Waste", tone: "out" };
    case "production_consume":
      return { label: refType === "packaging_out" ? "Packaging out" : "Consumed", tone: "out" };
    case "opname_adj":
      if (refType === "batch_cancel") return { label: "Batch reversed", tone: qty >= 0 ? "in" : "out" };
      return { label: qty > 0 ? "Opname +" : qty < 0 ? "Opname −" : "Opname =", tone: qty > 0 ? "in" : qty < 0 ? "out" : "neutral" };
    default: return { label: reason, tone: "neutral" };
  }
}

const toneColor = { in: "var(--green, #1a7f4b)", out: "var(--red)", neutral: "var(--soft)" } as const;

// Reason filter chips (value maps to stock_moves.reason; "" = all).
const REASONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "purchase", label: "Received" },
  { value: "production_output", label: "Produced" },
  { value: "production_consume", label: "Consumed" },
  { value: "sale", label: "Sold" },
  { value: "opname_adj", label: "Opname / reversal" },
  { value: "waste", label: "Waste" },
];
const KINDS: { value: string; label: string }[] = [
  { value: "", label: "All stock" },
  { value: "item", label: "Ingredients" },
  { value: "product", label: "Finished goods" },
];

const chip = (on: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 999,
  fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", textDecoration: "none",
  border: `1.5px solid ${on ? "var(--choco)" : "var(--line)"}`,
  background: on ? "var(--choco)" : "#fff", color: on ? "#fff" : "var(--soft)",
});

function href(kind: string, reason: string, page: number): string {
  const p = new URLSearchParams();
  if (kind) p.set("kind", kind);
  if (reason) p.set("reason", reason);
  if (page > 1) p.set("page", String(page));
  const q = p.toString();
  return "/admin/ops/stock/ledger" + (q ? `?${q}` : "");
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function OpsStockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; reason?: string; page?: string }>;
}) {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/stock/ledger" title="Ledger">
        <DbNotice />
      </OpsShell>
    );
  }

  const sp = await searchParams;
  const kind: StockLedgerKind | null = sp.kind === "item" || sp.kind === "product" ? sp.kind : null;
  const reason = sp.reason && REASONS.some((r) => r.value === sp.reason) ? sp.reason : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = { kind, reason };

  const [rows, total] = await Promise.all([
    listStockLedger({ ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countStockLedger(filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + rows.length;
  const kindKey = kind ?? "";
  const reasonKey = reason ?? "";

  return (
    <OpsShell active="/admin/ops/stock/ledger" title="Ledger" subtitle={`${total.toLocaleString("id-ID")} movement(s) · append-only`}>
      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {KINDS.map((k) => (
            <Link key={k.value} href={href(k.value, reasonKey, 1)} style={chip(kindKey === k.value)}>{k.label}</Link>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {REASONS.map((r) => (
            <Link key={r.value} href={href(kindKey, r.value, 1)} style={chip(reasonKey === r.value)}>{r.label}</Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--soft)", fontSize: 14 }}>No movements for this filter yet.</div>
      ) : (
        <div style={{ overflowX: "auto", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Movement</th>
                <th style={th}>Item</th>
                <th style={{ ...th, textAlign: "right" }}>Qty</th>
                <th style={{ ...th, textAlign: "right" }}>Unit cost</th>
                <th style={{ ...th, textAlign: "right" }}>Value</th>
                <th style={th}>Ref / note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = meta(r);
                const c = toneColor[m.tone];
                const signed = (r.qty > 0 ? "+" : "") + fmtQty(r.qty);
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, color: "var(--soft)", fontSize: 12.5 }}>{fmtWhen(r.at)}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 800, color: c }}>{m.label}</span>
                      <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.04em", color: "var(--soft)", textTransform: "uppercase" }}>
                        {r.kind === "product" ? "FG" : "ING"}
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: "normal", fontWeight: 700 }}>{r.name}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: c }}>
                      {signed} {r.unit && <span style={{ color: "var(--soft)", fontSize: 12, fontWeight: 600 }}>{r.unit}</span>}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "var(--soft)" }}>{r.unitCost ? rupiah(r.unitCost) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.value < 0 ? "var(--red)" : "var(--ink)" }}>
                      {r.value ? rupiah(r.value) : "—"}
                    </td>
                    <td style={{ ...td, whiteSpace: "normal", color: "var(--soft)", fontSize: 12.5 }}>
                      {r.refLabel && <span style={{ fontWeight: 700, color: "var(--ink)" }}>{r.refLabel}</span>}
                      {r.refLabel && r.note ? " · " : ""}
                      {r.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 10 }}>
        <div style={{ fontSize: 12.5, color: "var(--soft)", fontWeight: 700 }}>
          {from}–{to} of {total.toLocaleString("id-ID")}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {page > 1 ? (
            <Link href={href(kindKey, reasonKey, page - 1)} style={chip(false)}>‹ Prev</Link>
          ) : (
            <span style={{ ...chip(false), opacity: 0.4, pointerEvents: "none" }}>‹ Prev</span>
          )}
          {page < pages ? (
            <Link href={href(kindKey, reasonKey, page + 1)} style={chip(false)}>Next ›</Link>
          ) : (
            <span style={{ ...chip(false), opacity: 0.4, pointerEvents: "none" }}>Next ›</span>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
