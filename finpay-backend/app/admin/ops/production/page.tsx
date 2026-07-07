import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listRecipes, listOpenBatches, listBatchHistory } from "@/lib/opsStore";
import { OpsShell, DbNotice } from "../OpsChrome";
import ProductionPanel from "./ProductionPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsProductionPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/production" title="Production">
        <DbNotice />
      </OpsShell>
    );
  }

  const [recipes, openBatches, history] = await Promise.all([listRecipes(), listOpenBatches(), listBatchHistory()]);
  const subtitle = openBatches.length > 0 ? `${openBatches.length} in progress · ${history.length} recent` : "Start a batch to consume the recipe and cost it";

  return (
    <OpsShell active="/admin/ops/production" title="Production" subtitle={subtitle}>
      <ProductionPanel recipes={recipes} openBatches={openBatches} history={history} />
    </OpsShell>
  );
}
