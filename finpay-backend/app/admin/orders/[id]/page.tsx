/**
 * Legacy order-detail route — order management now lives in the ops menu.
 * Redirect to the unified ops order detail (/admin/ops/orders/[id]).
 */
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LegacyAdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/ops/orders/${id}`);
}
