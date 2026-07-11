import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getOpsSession, type OpsRole } from "@/lib/adminAuth";
import { countActivitySince } from "@/lib/opsStore";
import { OPS_STR, opsLangFromCookie, type OpsStrings } from "@/lib/opsI18n";
import ActivityBell from "./ActivityBell";
import OpsLangToggle from "./OpsLangToggle";

type ScrKey = keyof OpsStrings["scr"];
type GroupKey = keyof OpsStrings["groups"];

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
  label: string; // English identity (also the React key); display is localized via `k`
  k: ScrKey;
}
interface Group {
  label: string; // English identity used for active-group matching
  key: GroupKey;
  icon: string;
  tabs: Tab[];
}

// Overview home + five categories (grouped nav so the 13 screens aren't
// overwhelming — top row picks a category, second row its screens). Icons make
// the categories scannable at a glance on a phone in the kitchen (PRD §7).
const HOME: Tab = { href: "/admin/ops/today", label: "Today", k: "stock" /* unused; HOME uses t.today */ };

const GROUPS: Group[] = [
  {
    label: "Stock",
    key: "stock",
    icon: "📦",
    tabs: [
      { href: "/admin/ops/stock", label: "Stock", k: "stock" },
      { href: "/admin/ops/stock/ledger", label: "Ledger", k: "ledger" },
      { href: "/admin/ops/items", label: "Items", k: "items" },
      { href: "/admin/ops/receive", label: "Receive", k: "receive" },
      { href: "/admin/ops/opname", label: "Opname", k: "opname" },
      { href: "/admin/ops/waste", label: "Waste", k: "waste" },
    ],
  },
  {
    label: "Production",
    key: "production",
    icon: "🥐",
    tabs: [
      { href: "/admin/ops/recipes", label: "Recipes", k: "recipes" },
      { href: "/admin/ops/production", label: "Batches", k: "batches" },
    ],
  },
  {
    label: "Order",
    key: "order",
    icon: "🧾",
    tabs: [
      { href: "/admin/ops/board", label: "Board", k: "board" },
      { href: "/admin/ops/orders", label: "Orders", k: "orders" },
      { href: "/admin/ops/bake-sheet", label: "Bake", k: "bake" },
      { href: "/admin/ops/landing-menu", label: "Menu", k: "menu" },
      { href: "/admin/ops/menu-map", label: "Menu links", k: "menulinks" },
    ],
  },
  {
    label: "Finance",
    key: "finance",
    icon: "💰",
    tabs: [
      { href: "/admin/ops/money", label: "Money", k: "money" },
      { href: "/admin/ops/pricing", label: "Pricing", k: "pricing" },
      { href: "/admin/ops/forecast", label: "Forecast", k: "forecast" },
    ],
  },
  {
    label: "HR",
    key: "hr",
    icon: "👥",
    tabs: [{ href: "/admin/ops/team", label: "Team", k: "team" }],
  },
];

// Staff (e.g. Heral) see a scoped subset: log-day home + QoH stock, receive,
// opname, and starting production batches. No finance/HR/orders, no items/waste/
// recipes. Server-side gates enforce this too — the nav just reflects it.
const STAFF_GROUPS: Group[] = [
  {
    label: "Stock",
    key: "stock",
    icon: "📦",
    tabs: [
      { href: "/admin/ops/stock", label: "Stock", k: "stock" },
      { href: "/admin/ops/receive", label: "Receive", k: "receive" },
      { href: "/admin/ops/opname", label: "Opname", k: "opname" },
    ],
  },
  {
    label: "Production",
    key: "production",
    icon: "🥐",
    tabs: [{ href: "/admin/ops/production", label: "Batches", k: "batches" }],
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

const sideItem = (on: boolean) => "ops2-navitem" + (on ? " on" : "");

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

  const jar = await cookies();
  const lang = opsLangFromCookie(jar.get("ops_lang")?.value);
  const L = OPS_STR[lang];

  const activeGroup = groups.find((g) => g.tabs.some((t) => t.href === active)) ?? null;
  const onHome = active === HOME.href;

  const showSub = activeGroup && activeGroup.tabs.length > 1;

  // Activity bell (super_admin only): unread = entries logged since last opened.
  let unread = 0;
  if (role === "super_admin") {
    const seen = jar.get("ops_activity_seen")?.value ?? null;
    unread = await countActivitySince(seen);
  }

  return (
    <div className="ops2-root">
      {/* ≥900px — persistent grouped sidebar (kitchen desktop). Hidden on phones. */}
      <nav className="ops2-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 16px" }}>
          <img src="/images/mini-cookies.png" alt="" width={34} height={34} style={{ objectFit: "contain", flexShrink: 0 }} />
          <div style={{ lineHeight: 1.05 }}>
            <div className="font-display" style={{ fontSize: 15, color: "var(--on-dark)" }}>No Bites Left</div>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.16em", opacity: 0.55, marginTop: 2 }}>OPS</div>
          </div>
        </div>

        <Link href={HOME.href} className={sideItem(onHome)}>🗓️ {L.today}</Link>

        {groups.map((g) => (
          <div key={g.label}>
            <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.42, padding: "14px 12px 5px" }}>
              {g.icon} {L.groups[g.key]}
            </div>
            {g.tabs.map((t) => (
              <Link key={t.href} href={t.href} className={sideItem(t.href === active)}>
                {L.scr[t.k]}
              </Link>
            ))}
          </div>
        ))}

        <div style={{ flex: 1 }} />
        {role === "super_admin" && (
          <Link href="/admin" style={{ padding: "10px 12px", fontSize: 12.5, fontWeight: 800, color: "rgba(244,235,221,0.6)", textDecoration: "none" }}>‹ {L.queue}</Link>
        )}
      </nav>

      <div className="ops2-main">
        {/* ≥900px — page header (title + subtitle). No bell / lang toggle this pass. */}
        <header className="ops2-header">
          <div>
            <div className="font-display" style={{ fontSize: "clamp(20px,3vw,25px)", color: "var(--choco)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soft)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <OpsLangToggle lang={lang} />
            {role === "super_admin" && <ActivityBell unread={unread} lang={lang} />}
          </div>
        </header>

        {/* <900px — brand + title header, then the two-row chip nav (unchanged). */}
        <div className="ops2-chipsbar">
          <div className="ops2-navrow" style={{ paddingTop: 16, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/images/mini-cookies.png" alt="" width={32} height={32} style={{ objectFit: "contain", flexShrink: 0 }} />
              <div>
                <div className="font-display" style={{ fontSize: 20, color: "var(--choco)" }}>{title}</div>
                {subtitle && <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>{subtitle}</div>}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <OpsLangToggle lang={lang} />
              {role === "super_admin" && <ActivityBell unread={unread} lang={lang} />}
              {role === "super_admin" && (
                <Link href="/admin" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>‹ {L.queue}</Link>
              )}
            </div>
          </div>

          {/* Row 1 — Today + category chips (each links to its first screen). */}
          <div className="ops2-navrow" style={{ paddingTop: 6, display: "flex", gap: 6, overflowX: "auto" }}>
            <Link href={HOME.href} style={chipStyle(onHome)}>
              <span aria-hidden style={{ fontSize: 14 }}>🗓️</span>
              {L.today}
            </Link>
            {groups.map((g) => (
              <Link key={g.label} href={g.tabs[0].href} style={chipStyle(activeGroup?.label === g.label)}>
                <span aria-hidden style={{ fontSize: 14 }}>{g.icon}</span>
                {L.groups[g.key]}
              </Link>
            ))}
          </div>

          {/* Row 2 — screens within the active category (hidden on Today, and for
              single-screen categories where the chip already lands you there). */}
          {showSub && (
            <div className="ops2-navrow" style={{ paddingTop: 10, paddingBottom: 4, display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
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
                    {L.scr[t.k]}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="ops2-body">{children}</div>
      </div>
    </div>
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
