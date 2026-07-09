import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listChannels, listPricingProducts, listSalesOrders, listInvoices, listPreparingItems, syncWebsiteOrders } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";
import { OpsShell, DbNotice } from "../OpsChrome";
import OrdersPanel from "./OrdersPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsOrdersPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/orders" title="Orders">
        <DbNotice />
      </OpsShell>
    );
  }

  // Pull any paid website orders into ops before listing (idempotent). Guarded
  // so a sync hiccup never blanks the Orders page.
  try {
    await syncWebsiteOrders();
  } catch (e) {
    logOrder("ops_website_sync_failed", { error: String(e) });
  }

  const [channels, products, orders, invoices, prep] = await Promise.all([
    listChannels(),
    listPricingProducts(),
    listSalesOrders(),
    listInvoices(),
    listPreparingItems(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const subtitle = orders.length > 0 ? `${orders.length} recorded` : "Log WA / direct / marketplace / B2B / canteen orders";

  return (
    <OpsShell active="/admin/ops/orders" title="Orders" subtitle={subtitle}>
      <OrdersPanel channels={channels} products={products} orders={orders} invoices={invoices} prep={prep} today={today} />
    </OpsShell>
  );
}
