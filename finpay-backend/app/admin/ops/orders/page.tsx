import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listChannels, listPricingProducts, listSalesOrders, listInvoices } from "@/lib/opsStore";
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

  const [channels, products, orders, invoices] = await Promise.all([
    listChannels(),
    listPricingProducts(),
    listSalesOrders(),
    listInvoices(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const subtitle = orders.length > 0 ? `${orders.length} recorded` : "Log WA / direct / marketplace / B2B orders";

  return (
    <OpsShell active="/admin/ops/orders" title="Orders" subtitle={subtitle}>
      <OrdersPanel channels={channels} products={products} orders={orders} invoices={invoices} today={today} />
    </OpsShell>
  );
}
