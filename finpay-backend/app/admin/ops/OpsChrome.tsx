import Link from "next/link";
import type { ReactNode } from "react";
import { getOpsSession, type OpsRole } from "@/lib/adminAuth";

/** Shared shell + tab nav for the Ops (inventory) screens. Mobile-first: these
 *  are used standing in the kitchen, phone in hand (PRD §7). */

export function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

/** Trim trailing zeros so "130.0000" avg cost etc. read cleanly. */
export function qty(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

interface Tab {
  href: string;
  label: string;
}
interface Group {
  label: string;
  icon: string;
  tabs: Tab[];
}

// Overview home + five categories (grouped nav so the 13 screens aren't
// overwhelming — top row picks a category, second row its screens). Icons make
// the categories scannable at a glance on a phone in the kitchen (PRD §7).
const HOME: Tab = { href: "/admin/ops/today", label: "Today" };

const GROUPS: Group[] = [
  {
    label: "Stock",
    icon: "📦",
    tabs: [
      { href: "/admin/ops/stock", label: "Stock" },
      { href: "/admin/ops/items", label: "Items" },
      { href: "/admin/ops/receive", label: "Receive" },
      { href: "/admin/ops/opname", label: "Opname" },
      { href: "/admin/ops/waste", label: "Waste" },
    ],
  },
  {
    label: "Production",
    icon: "🥐",
    tabs: [
      { href: "/admin/ops/recipes", label: "Recipes" },
      { href: "/admin/ops/production", label: "Batches" },
    ],
  },
  {
    label: "Order",
    icon: "🧾",
    tabs: [
      { href: "/admin/ops/orders", label: "Orders" },
      { href: "/admin/ops/menu-map", label: "Menu links" },
    ],
  },
  {
    label: "Finance",
    icon: "💰",
    tabs: [
      { href: "/admin/ops/money", label: "Money" },
      { href: "/admin/ops/pricing", label: "Pricing" },
      { href: "/admin/ops/forecast", label: "Forecast" },
    ],
  },
  {
    label: "HR",
    icon: "👥",
    tabs: [{ href: "/admin/ops/team", label: "Team" }],
  },
];

// Staff (e.g. Heral) see a scoped subset: log-day home + QoH stock, receive,
// opname, and starting production batches. No finance/HR/orders, no items/waste/
// recipes. Server-side gates enforce this too — the nav just reflects it.
const STAFF_GROUPS: Group[] = [
  {
    label: "Stock",
    icon: "📦",
    tabs: [
      { href: "/admin/ops/stock", label: "Stock" },
      { href: "/admin/ops/receive", label: "Receive" },
      { href: "/admin/ops/opname", label: "Opname" },
    ],
  },
  {
    label: "Production",
    icon: "🥐",
    tabs: [{ href: "/admin/ops/production", label: "Batches" }],
  },
];

function groupsFor(role: OpsRole): Group[] {
  return role === "staff" ? STAFF_GROUPS : GROUPS;
}

const chipBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
  textDecoration: "none",
};

function chipStyle(on: boolean): React.CSSProperties {
  return {
    ...chipBase,
    border: `1.5px solid ${on ? "var(--choco)" : "var(--line)"}`,
    background: on ? "var(--choco)" : "#fff",
    color: on ? "#fff" : "var(--soft)",
    boxShadow: on ? "0 2px 8px rgba(84,48,11,0.18)" : "none",
  };
}

export async function OpsShell({
  active,
  title,
  subtitle,
  children,
}: {
  active: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const session = await getOpsSession();
  const role: OpsRole = session?.role === "staff" ? "staff" : "super_admin";
  const groups = groupsFor(role);

  const activeGroup = groups.find((g) => g.tabs.some((t) => t.href === active)) ?? null;
  const onHome = active === HOME.href;

  const showSub = activeGroup && activeGroup.tabs.length > 1;

  return (
    <main className="ops-shell">
      {/* Sticky nav — stays reachable while scrolling long stock / ledger lists. */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--surface2)", borderBottom: "1.5px solid var(--line)", paddingBottom: showSub ? 10 : 12 }}>
        <div className="ops-navrow" style={{ paddingTop: 18, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "var(--choco)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>{subtitle}</div>}
          </div>
          {role === "super_admin" && (
            <Link href="/admin" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>‹ Queue</Link>
          )}
        </div>

        {/* Row 1 — Today + category chips (each links to its first screen). */}
        <div className="ops-navrow" style={{ paddingTop: 6, display: "flex", gap: 6, overflowX: "auto" }}>
          <Link href={HOME.href} style={chipStyle(onHome)}>
            <span aria-hidden style={{ fontSize: 14 }}>🗓️</span>
            {HOME.label}
          </Link>
          {groups.map((g) => (
            <Link key={g.label} href={g.tabs[0].href} style={chipStyle(activeGroup?.label === g.label)}>
              <span aria-hidden style={{ fontSize: 14 }}>{g.icon}</span>
              {g.label}
            </Link>
          ))}
        </div>

        {/* Row 2 — screens within the active category (hidden on Today, and for
            single-screen categories where the chip already lands you there). */}
        {showSub && (
          <div className="ops-navrow" style={{ paddingTop: 10, display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
            <span aria-hidden style={{ fontSize: 15, marginRight: 2, flexShrink: 0 }}>{activeGroup!.icon}</span>
            {activeGroup!.tabs.map((t) => {
              const on = t.href === active;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  style={{
                    ...chipBase,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    border: `1.5px solid ${on ? "var(--choco)" : "var(--line)"}`,
                    background: on ? "var(--surface)" : "transparent",
                    color: on ? "var(--choco)" : "var(--soft)",
                    fontWeight: on ? 800 : 700,
                  }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="ops-body">{children}</div>
    </main>
  );
}

export function DbNotice() {
  return (
    <div style={{ padding: "16px 18px", background: "#fff3e2", border: "1.5px solid var(--orange)", borderRadius: 14, fontSize: 13.5, color: "var(--choco)" }}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>Ops needs a database connection</div>
      This screen reads the live <code>ops</code> schema and can&apos;t run against the local file store. Set <code>DATABASE_URL</code> (it&apos;s configured in production).
    </div>
  );
}
