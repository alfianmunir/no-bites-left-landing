/**
 * /admin/ops/orders — unified Order command center. Section order:
 *
 *   1. TO PREPARE      — per-product totals across preparing orders
 *   2. NEW ORDER       — manual entry for WA / direct / marketplace / B2B / canteen
 *   3. WEBSITE ORDERS  — the storefront queue (ops.sales_orders native), cards open
 *                        the detail modal; bulk bar sets status forward-only
 *   4. OTHER ORDERS    — non-website channels grouped by date (+ B2B invoices)
 *
 * reconcileWebsiteFinance() sweeps any paid website order whose ledger effect
 * the webhook didn't post (backstop only).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import type { Order } from "@/lib/orders";
import {
  opsEnabled,
  listChannels,
  listPricingProducts,
  listSalesOrders,
  listInvoices,
  listPreparingItems,
  listUnmappedWebsiteSkus,
  reconcileWebsiteFinance,
} from "@/lib/opsStore";
import { logOrder } from "@/lib/log";
import { OpsShell, DbNotice } from "../OpsChrome";
import OrdersPanel, { OrderEntry, PrepList } from "./OrdersPanel";
import WebsitePickupQueue from "./WebsitePickupQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sectionTitle: React.CSSProperties = { fontWeight: 900, fontSize: 15, color: "var(--choco)", marginBottom: 12 };

export default async function OpsOrdersPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  // Website orders queue (native ops.sales_orders via the OrderStore).
  const store = getStore();
  await store.init();
  const [paid, baking, ready, expired] = await Promise.all([
    store.list({ status: "PAID" }),
    store.list({ status: "BAKING" }),
    store.list({ status: "READY_FOR_PICKUP" }),
    store.list({ status: "EXPIRED" }),
  ]);
  const active: Order[] = [...paid, ...baking, ...ready];

  const websiteSection = (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>🛍 Website orders</div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/admin/ops/bake-sheet" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--choco)", textDecoration: "none" }}>Bake sheet →</Link>
          <Link href="/admin/wholesale" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>Wholesale →</Link>
        </div>
      </div>
      <WebsitePickupQueue active={active} expired={expired} today={today} tomorrow={tomorrow} />
    </section>
  );

  // Prep list, order entry, and the channel manager need the ops DB.
  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/orders" title="Orders" subtitle={`${active.length} website order(s)`}>
        {websiteSection}
        <DbNotice />
      </OpsShell>
    );
  }

  // Backstop: realize finance for any paid website order the webhook missed
  // (idempotent). Guarded so a hiccup never blanks the page.
  try {
    await reconcileWebsiteFinance();
  } catch (e) {
    logOrder("ops_website_reconcile_failed", { error: String(e) });
  }

  const [channels, products, salesOrders, invoices, prep, unmappedSkus] = await Promise.all([
    listChannels(),
    listPricingProducts(),
    listSalesOrders(),
    listInvoices(),
    listPreparingItems(),
    listUnmappedWebsiteSkus(),
  ]);
  // Website orders live in the queue section; the manual channels here. Website
  // is also excluded from the entry form — storefront orders are born native.
  const channelOrders = salesOrders.filter((o) => o.channel !== "website");
  const entryChannels = channels.filter((c) => c.name !== "website");
  const subtitle = `${active.length} website order(s) · ${channelOrders.length} channel order(s)`;

  return (
    <OpsShell active="/admin/ops/orders" title="Orders" subtitle={subtitle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {/* 1. To prepare */}
        <section>
          <PrepList prep={prep} />
        </section>

        {/* 2. New order */}
        <section>
          <OrderEntry channels={entryChannels} products={products} />
        </section>

        {/* 3. Website orders (+ bulk status) */}
        <div>
          {unmappedSkus.length > 0 && (
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "#fff3e2", border: "1.5px solid var(--orange)", borderRadius: 12, fontSize: 12.5, color: "var(--choco)" }}>
              <div style={{ fontWeight: 900, marginBottom: 2 }}>{unmappedSkus.length} menu item(s) not linked to an ops product</div>
              Their orders still show and sell fine, but cost &amp; stock won&apos;t post until you link{" "}
              <span style={{ fontWeight: 800 }}>{unmappedSkus.join(", ")}</span>{" "}
              on the <Link href="/admin/ops/menu-map" style={{ fontWeight: 800, color: "var(--choco)" }}>Menu links</Link> screen.
            </div>
          )}
          {websiteSection}
        </div>

        {/* 4. Other orders by date (+ B2B invoices) */}
        <section>
          <div style={sectionTitle}>Other orders</div>
          <OrdersPanel orders={channelOrders} invoices={invoices} today={today} />
        </section>
      </div>
    </OpsShell>
  );
}
