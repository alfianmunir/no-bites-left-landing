import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell + tab nav for the Ops (inventory) screens. Mobile-first: these
 *  are used standing in the kitchen, phone in hand (PRD §7). */

export function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

/** Trim trailing zeros so "130.0000" avg cost etc. read cleanly. */
export function qty(n: number): string {
  return Number(n.toFixed(3)).toLocaleString("id-ID");
}

const TABS: Array<{ href: string; label: string }> = [
  { href: "/admin/ops/today", label: "Today" },
  { href: "/admin/ops/stock", label: "Stock" },
  { href: "/admin/ops/items", label: "Items" },
  { href: "/admin/ops/receive", label: "Receive" },
  { href: "/admin/ops/recipes", label: "Recipes" },
  { href: "/admin/ops/production", label: "Production" },
  { href: "/admin/ops/orders", label: "Orders" },
  { href: "/admin/ops/money", label: "Money" },
  { href: "/admin/ops/team", label: "Team" },
  { href: "/admin/ops/opname", label: "Opname" },
  { href: "/admin/ops/waste", label: "Waste" },
  { href: "/admin/ops/pricing", label: "Pricing" },
  { href: "/admin/ops/forecast", label: "Forecast" },
];

export function OpsShell({
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
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)" }}>
      <div style={{ padding: "18px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "var(--choco)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <Link href="/admin" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>‹ Queue</Link>
      </div>

      <div style={{ padding: "6px 20px 0", display: "flex", gap: 6, overflowX: "auto" }}>
        {TABS.map((t) => {
          const on = t.href === active;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 800,
                whiteSpace: "nowrap",
                textDecoration: "none",
                border: `1.5px solid ${on ? "var(--choco)" : "var(--line)"}`,
                background: on ? "var(--choco)" : "#fff",
                color: on ? "#fff" : "var(--soft)",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div style={{ padding: "14px 20px 48px" }}>{children}</div>
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
