/**
 * GET /admin/ops/orders/[id] — unified order detail inside the ops menu.
 *
 * Website pickup orders are the source of truth in public.orders; the lifecycle
 * actions here (Advance → fires the customer "ready" email; Cancel/Refund → run
 * through Finpay) write back to the real order via /api/admin/orders/[id]/*.
 * Reuses the proven AdminOrderDetail, back-linked to the ops command center.
 */
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import AdminOrderDetail from "@/app/_components/AdminOrderDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) redirect("/admin/login");

  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) redirect("/admin/ops/orders");

  return <AdminOrderDetail order={order} backHref="/admin/ops/orders" />;
}
