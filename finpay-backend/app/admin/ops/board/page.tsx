import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listSalesOrders, reconcileWebsiteFinance, type SalesOrderRow } from "@/lib/opsStore";
import { OPS_STR, opsLangFromCookie } from "@/lib/opsI18n";
import { logOrder } from "@/lib/log";
import { OpsShell, DbNotice, qty } from "../OpsChrome";
import BoardOrderLine from "./BoardOrderLine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = [
  { key: "preparing", label: "Preparing", color: "var(--orange)" },
  { key: "packed", label: "Packed", color: "var(--blue)" },
  { key: "ready_for_pickup", label: "Ready for pickup", color: "var(--choco)" },
  { key: "in_delivery", label: "In delivery", color: "var(--choco)" },
  { key: "delivered", label: "Delivered", color: "var(--green)" },
] as const;

const card: React.CSSProperties = { background: "#fff", border: "1.5px solid var(--line)", borderRadius: 16, padding: 14 };
const sectionLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.05em", marginBottom: 8 };

function itemsSummary(items: { name: string; qty: number }[]): string {
  return items.map((i) => `${qty(i.qty)}× ${i.name}`).join(" · ");
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ ...card, flex: "1 1 120px", minWidth: 110 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--soft)", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: tone ?? "var(--ink)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default async function OpsBoardPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const lang = opsLangFromCookie((await cookies()).get("ops_lang")?.value);
  const L = OPS_STR[lang];

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/board" title={L.boardTitle}>
        <DbNotice />
      </OpsShell>
    );
  }

  // Backstop: realize finance for any paid website order the webhook missed.
  try { await reconcileWebsiteFinance(); } catch (e) { logOrder("ops_board_reconcile_failed", { error: String(e) }); }

  const orders = await listSalesOrders(200);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const active = orders.filter(
    (o) => o.fulfillmentStatus !== "delivered" && o.fulfillmentStatus !== "picked_up" && o.status !== "cancelled",
  );
  const byStage = (k: string) => active.filter((o) => o.fulfillmentStatus === k);

  // Pickups (website orders with a date, not yet delivered), soonest first.
  const pickups = active.filter((o) => o.pickupDate).sort((a, b) => (a.pickupDate! < b.pickupDate! ? -1 : 1));
  const pickBucket = (o: SalesOrderRow) =>
    o.pickupDate! < today ? "Overdue" : o.pickupDate === today ? "Today" : o.pickupDate === tomorrow ? "Tomorrow" : "Upcoming";
  const pickupGroups = ["Overdue", "Today", "Tomorrow", "Upcoming"].map((g) => ({ g, list: pickups.filter((o) => pickBucket(o) === g) })).filter((x) => x.list.length > 0);

  const pickupsToday = pickups.filter((o) => o.pickupDate === today).length;
  const subtitle = `${active.length} ${L.open} · ${byStage("preparing").length} ${L.stPreparing.toLowerCase()}`;
  const bkLabel: Record<string, string> = { Overdue: L.bkOverdue, Today: L.bkToday, Tomorrow: L.bkTomorrow, Upcoming: L.bkUpcoming };
  const stageLabel: Record<string, string> = { preparing: L.stPreparing, packed: L.stPacked, ready_for_pickup: L.stReady, in_delivery: L.stDelivery, delivered: L.stDelivered };

  return (
    <OpsShell active="/admin/ops/board" title={L.boardTitle} subtitle={subtitle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Snapshot */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat label={L.openOrders} value={String(active.length)} />
          <Stat label={L.stPreparing} value={String(byStage("preparing").length)} tone="var(--orange)" />
          <Stat label={L.stPacked} value={String(byStage("packed").length)} tone="var(--blue)" />
          <Stat label={L.pickupsToday} value={String(pickupsToday)} tone={pickupsToday ? "var(--choco)" : "var(--ink)"} />
        </div>

        {/* Pickups by day */}
        {pickupGroups.length > 0 && (
          <div>
            <div style={sectionLabel}>{L.pickupsLabel}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pickupGroups.map(({ g, list }) => (
                <div key={g} style={{ ...card, borderColor: g === "Overdue" ? "var(--red)" : g === "Today" ? "var(--choco)" : "var(--line)" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: g === "Overdue" ? "var(--red)" : "var(--choco)" }}>{bkLabel[g]} <span style={{ color: "var(--soft)", fontWeight: 700 }}>· {list.length}</span></div>
                  {list.map((o) => <BoardOrderLine key={o.id} o={o} itemsLine={itemsSummary(o.items)} lang={lang} />)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage board */}
        <div>
          <div style={sectionLabel}>{L.byStage}</div>
          {active.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>{L.boardEmpty}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {STAGES.filter((s) => s.key !== "delivered").map((s) => {
                const list = byStage(s.key);
                return (
                  <div key={s.key} style={{ ...card, borderLeft: `4px solid ${s.color}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--ink)" }}>{stageLabel[s.key]} <span style={{ color: "var(--soft)", fontWeight: 700 }}>· {list.length}</span></div>
                    {list.length === 0 ? <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 4 }}>—</div> : list.map((o) => <BoardOrderLine key={o.id} o={o} itemsLine={itemsSummary(o.items)} lang={lang} />)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Link href="/admin/ops/orders" style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 800, color: "var(--choco)", textDecoration: "none" }}>
          {L.recordEdit} →
        </Link>
      </div>
    </OpsShell>
  );
}
