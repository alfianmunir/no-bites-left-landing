import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listMenuMap, listPricingProducts } from "@/lib/opsStore";
import { OpsShell, DbNotice } from "../OpsChrome";
import MenuMapPanel from "./MenuMapPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsMenuMapPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/menu-map" title="Menu links">
        <DbNotice />
      </OpsShell>
    );
  }

  const [rows, products] = await Promise.all([listMenuMap(), listPricingProducts()]);
  const linked = rows.filter((r) => r.productId).length;
  const subtitle = `${linked}/${rows.length} storefront items linked to a product`;

  return (
    <OpsShell active="/admin/ops/menu-map" title="Menu links" subtitle={subtitle}>
      <MenuMapPanel rows={rows} products={products} />
    </OpsShell>
  );
}
