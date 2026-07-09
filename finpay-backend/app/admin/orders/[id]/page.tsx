/**
 * Legacy order-detail route — order management now lives in the ops Orders
 * command center, where website order details open in a modal (no standalone
 * detail page). Redirect there.
 */
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LegacyAdminOrderDetailPage() {
  redirect(`/admin/ops/orders`);
}
