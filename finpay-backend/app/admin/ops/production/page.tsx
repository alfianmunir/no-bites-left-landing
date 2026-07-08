import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import {
  opsEnabled,
  listRecipes,
  listOpenBatches,
  listBatchHistory,
  listOpenBatchCycles,
  listBatchCycleHistory,
} from "@/lib/opsStore";
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

  const [recipes, openBatches, history, openCycles, cycleHistory] = await Promise.all([
    listRecipes(),
    listOpenBatches(),
    listBatchHistory(),
    listOpenBatchCycles(),
    listBatchCycleHistory(),
  ]);
  const openCount = openBatches.length + openCycles.length;
  const subtitle = openCount > 0 ? `${openCount} in progress · ${cycleHistory.length + history.length} recent` : "Build a batch — add recipes, check stock, then bake & cost it";

  return (
    <OpsShell active="/admin/ops/production" title="Production" subtitle={subtitle}>
      <ProductionPanel
        recipes={recipes}
        openBatches={openBatches}
        history={history}
        openCycles={openCycles}
        cycleHistory={cycleHistory}
      />
    </OpsShell>
  );
}
