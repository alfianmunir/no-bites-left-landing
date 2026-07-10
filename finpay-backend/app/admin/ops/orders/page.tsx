/**
 * /admin/ops/orders — unified Order command center. Section order:
 *
 *   1. TO PREPARE   — per-product totals across preparing orders
 *   2. NEW ORDER    — manual entry for WA / direct / marketplace / B2B / canteen
 *   3. ALL ORDERS   — website + channel orders in ONE date-grouped list, with
 *                     filters, a single bulk bar, and the B2B invoices (AR)
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
import { OrderEntry, PrepList } from "./OrdersPanel";
import AllOrdersList from "./AllOrdersList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Without the ops DB we can still show the website queue (channel data, costs,
  // and invoices are unavailable — degrade gracefully).
  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/orders" title="Orders" subtitle={`${active.length} website order(s)`}>
        <AllOrdersList
          webOrders={active}
          channelOrders={[]}
          invoices={[]}
          expired={expired}
          today={today}
          tomorrow={tomorrow}
          products={[]}
          websiteFee={{ pct: 0, flat: 0 }}
        />
        <div style={{ marginTop: 18 }}><DbNotice /></div>
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
  const websiteChannel = channels.find((c) => c.name === "website");
  const websiteFee = { pct: websiteChannel?.feePct ?? 0, flat: websiteChannel?.feeFlat ?? 0 };
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

        {/* Unmapped SKU warning (cost/stock won't post until linked). */}
        {unmappedSkus.length > 0 && (
          <div style={{ padding: "12px 14px", background: "#fff3e2", border: "1.5px solid var(--orange)", borderRadius: 12, fontSize: 12.5, color: "var(--choco)" }}>
            <div style={{ fontWeight: 900, marginBottom: 2 }}>{unmappedSkus.length} menu item(s) not linked to an ops product</div>
            Their orders still show and sell fine, but cost &amp; stock won&apos;t post until you link{" "}
            <span style={{ fontWeight: 800 }}>{unmappedSkus.join(", ")}</span>{" "}
            on the <Link href="/admin/ops/menu-map" style={{ fontWeight: 800, color: "var(--choco)" }}>Menu links</Link> screen.
          </div>
        )}

        {/* 3. All orders (website + channel, one list) + B2B invoices */}
        <section>
          <AllOrdersList
            webOrders={active}
            channelOrders={channelOrders}
            invoices={invoices}
            expired={expired}
            today={today}
            tomorrow={tomorrow}
            products={products}
            websiteFee={websiteFee}
          />
        </section>
      </div>
    </OpsShell>
  );
}
