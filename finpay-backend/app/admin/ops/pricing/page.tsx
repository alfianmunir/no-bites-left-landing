import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listPricingProducts, getPricingConfig, listProductCosting, type ProductCosting } from "@/lib/opsStore";
import { computeSkuPricing } from "@/lib/opsPricing";
import { OpsShell, DbNotice } from "../OpsChrome";
import PricingTable from "./PricingTable";
import CostProvenance from "./CostProvenance";

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
  // Cost provenance (H4) — resilient if the phase-12 view isn't applied yet.
  let costing: ProductCosting[] = [];
  try {
    costing = await listProductCosting();
  } catch {
    costing = [];
  }
  // Count below-floor SKUs at the live config waste rate for the subtitle.
  const belowFloor = products.filter((p) => computeSkuPricing(p, config).belowFloor).length;
  const subtitle = belowFloor > 0 ? `${products.length} SKUs · ${belowFloor} below floor` : `${products.length} SKUs · all clear the floor`;

  return (
    <OpsShell active="/admin/ops/pricing" title="Pricing & margins" subtitle={subtitle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <PricingTable products={products} config={config} />
        {costing.length > 0 && <CostProvenance rows={costing} />}
      </div>
    </OpsShell>
  );
}
