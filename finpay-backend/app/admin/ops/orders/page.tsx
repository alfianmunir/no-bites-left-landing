/**
 * /admin/ops/orders — unified Order command center.
 *
 * Top: the WEBSITE PICKUP QUEUE, read live from public.orders (source of truth),
 * so every paid storefront order is always visible here regardless of menu
 * mapping. Cards open the ops order detail, where advancing fires the customer
 * email and cancel/refund run through Finpay (ops drives the real order).
 *
 * Below: the CHANNEL ORDER manager (WA / direct / marketplace / B2B / canteen)
 * backed by ops.sales_orders. syncWebsiteOrders() still runs to mirror website
 * revenue into the finance ledger, but the queue above no longer depends on it.
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
  syncWebsiteOrders,
} from "@/lib/opsStore";
import { logOrder } from "@/lib/log";
import { OpsShell, DbNotice } from "../OpsChrome";
import OrdersPanel from "./OrdersPanel";
import WebsitePickupQueue from "./WebsitePickupQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsOrdersPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  // Website pickup queue — always available (reads public.orders, works even
  // without the ops DB).
  const store = getStore();
  await store.init();
  const [paid, baking, ready, expired] = await Promise.all([
    store.list({ status: "PAID" }),
    store.list({ status: "BAKING" }),
    store.list({ status: "READY_FOR_PICKUP" }),
    store.list({ status: "EXPIRED" }),
  ]);
  const active: Order[] = [...paid, ...baking, ...ready];

  const queueSection = (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)" }}>🛍 Website pickups</div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/admin/ops/bake-sheet" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--choco)", textDecoration: "none" }}>Bake sheet →</Link>
          <Link href="/admin/wholesale" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>Wholesale →</Link>
        </div>
      </div>
      <WebsitePickupQueue active={active} expired={expired} today={today} tomorrow={tomorrow} />
    </section>
  );

  // Channel orders + finance mirror need the ops DB.
  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/orders" title="Orders" subtitle={`${active.length} website pickup(s)`}>
        {queueSection}
        <DbNotice />
      </OpsShell>
    );
  }

  // Mirror paid website orders into the finance ledger (idempotent, resilient).
  // Guarded so a sync hiccup never blanks the page.
  try {
    await syncWebsiteOrders();
  } catch (e) {
    logOrder("ops_website_sync_failed", { error: String(e) });
  }

  const [channels, products, salesOrders, invoices, prep, unmappedSkus] = await Promise.all([
    listChannels(),
    listPricingProducts(),
    listSalesOrders(),
    listInvoices(),
    listPreparingItems(),
    listUnmappedWebsiteSkus(),
  ]);
  // The command center shows website orders live (above); here we show only the
  // ops-native channel orders so website mirrors aren't listed twice.
  const channelOrders = salesOrders.filter((o) => !o.sourceOrderId);
  const subtitle = `${active.length} website pickup(s) · ${channelOrders.length} channel order(s)`;

  return (
    <OpsShell active="/admin/ops/orders" title="Orders" subtitle={subtitle}>
      {unmappedSkus.length > 0 && (
        <div style={{ marginBottom: 18, padding: "12px 14px", background: "#fff3e2", border: "1.5px solid var(--orange)", borderRadius: 12, fontSize: 12.5, color: "var(--choco)" }}>
          <div style={{ fontWeight: 900, marginBottom: 2 }}>{unmappedSkus.length} menu item(s) not linked to an ops product</div>
          Their orders still show and sell fine, but cost &amp; stock won&apos;t post until you link{" "}
          <span style={{ fontWeight: 800 }}>{unmappedSkus.join(", ")}</span>{" "}
          on the <Link href="/admin/ops/menu-map" style={{ fontWeight: 800, color: "var(--choco)" }}>Menu links</Link> screen.
        </div>
      )}

      {queueSection}

      <section>
        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--choco)", marginBottom: 4 }}>Channel orders</div>
        <div style={{ fontSize: 12, color: "var(--soft)", marginBottom: 12 }}>WA / direct / marketplace / B2B / canteen — recorded manually.</div>
        <OrdersPanel channels={channels} products={products} orders={channelOrders} invoices={invoices} prep={prep} today={today} />
      </section>
    </OpsShell>
  );
}
