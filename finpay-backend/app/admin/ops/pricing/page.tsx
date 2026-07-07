import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listPricingProducts, getPricingConfig } from "@/lib/opsStore";
import { computeSkuPricing } from "@/lib/opsPricing";
import { OpsShell, DbNotice } from "../OpsChrome";
import PricingTable from "./PricingTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsPricingPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/pricing" title="Pricing">
        <DbNotice />
      </OpsShell>
    );
  }

  const [products, config] = await Promise.all([listPricingProducts(), getPricingConfig()]);
  // Count below-floor SKUs at the live config waste rate for the subtitle.
  const belowFloor = products.filter((p) => computeSkuPricing(p, config).belowFloor).length;
  const subtitle = belowFloor > 0 ? `${products.length} SKUs · ${belowFloor} below floor` : `${products.length} SKUs · all clear the floor`;

  return (
    <OpsShell active="/admin/ops/pricing" title="Pricing & margins" subtitle={subtitle}>
      <PricingTable products={products} config={config} />
    </OpsShell>
  );
}
