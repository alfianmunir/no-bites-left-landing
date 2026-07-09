/**
 * Admin home — the pickup queue now lives in the ops menu as the unified Order
 * command center (website pickups + channel orders + bake sheet + per-order
 * lifecycle). Redirect there so there's a single place to work.
 */
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  redirect("/admin/ops/orders");
}
