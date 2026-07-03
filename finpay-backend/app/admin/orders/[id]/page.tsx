import { redirect, notFound } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import AdminOrderDetail from "./AdminOrderDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) redirect("/admin/login");

  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) notFound();

  return <AdminOrderDetail order={order} />;
}
