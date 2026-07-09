import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listSalesOrders, syncWebsiteOrders, type SalesOrderRow } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";
import { OpsShell, DbNotice, rupiah, qty } from "../OpsChrome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = [
  { key: "preparing", label: "Preparing", color: "var(--orange)" },
  { key: "packed", label: "Packed", color: "var(--blue)" },
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

function OrderLine({ o }: { o: SalesOrderRow }) {
  const st = STAGES.find((s) => s.key === o.fulfillmentStatus);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
      <div style={{ minWidth: 150, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {o.customerRef || "—"} <span style={{ color: "var(--soft)", fontWeight: 600, fontSize: 11.5 }}>· {o.channel}</span>
          {o.paymentStatus === "unpaid" && o.channel !== "b2b" && <span style={{ color: "var(--orange)", fontWeight: 800, fontSize: 11 }}> · unpaid</span>}
        </div>
        {o.items.length > 0 && <div style={{ fontSize: 12, color: "var(--soft)" }}>{itemsSummary(o.items)}</div>}
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {o.pickupDate && <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--choco)" }}>🛍 {o.pickupDate}</div>}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: st?.color ?? "var(--soft)", borderRadius: 999, padding: "2px 8px" }}>{st?.label ?? o.fulfillmentStatus}</span>
      </div>
    </div>
  );
}

export default async function OpsBoardPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/board" title="Order board">
        <DbNotice />
      </OpsShell>
    );
  }

  // Pull paid website orders in first (idempotent; guarded).
  try { await syncWebsiteOrders(); } catch (e) { logOrder("ops_board_sync_failed", { error: String(e) }); }

  const orders = await listSalesOrders(200);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const active = orders.filter((o) => o.fulfillmentStatus !== "delivered" && o.status !== "cancelled");
  const byStage = (k: string) => active.filter((o) => o.fulfillmentStatus === k);

  // Pickups (website orders with a date, not yet delivered), soonest first.
  const pickups = active.filter((o) => o.pickupDate).sort((a, b) => (a.pickupDate! < b.pickupDate! ? -1 : 1));
  const pickBucket = (o: SalesOrderRow) =>
    o.pickupDate! < today ? "Overdue" : o.pickupDate === today ? "Today" : o.pickupDate === tomorrow ? "Tomorrow" : "Upcoming";
  const pickupGroups = ["Overdue", "Today", "Tomorrow", "Upcoming"].map((g) => ({ g, list: pickups.filter((o) => pickBucket(o) === g) })).filter((x) => x.list.length > 0);

  const pickupsToday = pickups.filter((o) => o.pickupDate === today).length;
  const subtitle = `${active.length} open · ${byStage("preparing").length} preparing`;

  return (
    <OpsShell active="/admin/ops/board" title="Order board" subtitle={subtitle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Snapshot */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Open orders" value={String(active.length)} />
          <Stat label="Preparing" value={String(byStage("preparing").length)} tone="var(--orange)" />
          <Stat label="Packed" value={String(byStage("packed").length)} tone="var(--blue)" />
          <Stat label="Pickups today" value={String(pickupsToday)} tone={pickupsToday ? "var(--choco)" : "var(--ink)"} />
        </div>

        {/* Pickups by day */}
        {pickupGroups.length > 0 && (
          <div>
            <div style={sectionLabel}>PICKUPS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pickupGroups.map(({ g, list }) => (
                <div key={g} style={{ ...card, borderColor: g === "Overdue" ? "var(--red)" : g === "Today" ? "var(--choco)" : "var(--line)" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: g === "Overdue" ? "var(--red)" : "var(--choco)" }}>{g} <span style={{ color: "var(--soft)", fontWeight: 700 }}>· {list.length}</span></div>
                  {list.map((o) => <OrderLine key={o.id} o={o} />)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage board */}
        <div>
          <div style={sectionLabel}>BY STAGE</div>
          {active.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "var(--soft)", fontSize: 13.5 }}>No open orders — all caught up. 🎉</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {STAGES.filter((s) => s.key !== "delivered").map((s) => {
                const list = byStage(s.key);
                return (
                  <div key={s.key} style={{ ...card, borderLeft: `4px solid ${s.color}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--ink)" }}>{s.label} <span style={{ color: "var(--soft)", fontWeight: 700 }}>· {list.length}</span></div>
                    {list.length === 0 ? <div style={{ fontSize: 12, color: "var(--soft)", marginTop: 4 }}>—</div> : list.map((o) => <OrderLine key={o.id} o={o} />)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Link href="/admin/ops/orders" style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 800, color: "var(--choco)", textDecoration: "none" }}>
          Record / edit orders →
        </Link>
      </div>
    </OpsShell>
  );
}
