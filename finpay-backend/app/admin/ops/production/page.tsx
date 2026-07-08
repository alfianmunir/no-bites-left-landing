import { redirect } from "next/navigation";
import { getOpsSession } from "@/lib/adminAuth";
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
  const session = await getOpsSession();
  if (!session) redirect("/admin/login");
  const staff = session.role === "staff";

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/production" title="Production">
        <DbNotice />
      </OpsShell>
    );
  }

  // Staff (Heral) only build batches and watch what's open — no cost history,
  // no legacy single-recipe batches (which are super-admin-owned).
  const [recipes, openBatches, history, openCycles, cycleHistory] = await Promise.all([
    listRecipes(),
    staff ? Promise.resolve([]) : listOpenBatches(),
    staff ? Promise.resolve([]) : listBatchHistory(),
    listOpenBatchCycles(),
    staff ? Promise.resolve([]) : listBatchCycleHistory(),
  ]);
  const openCount = openBatches.length + openCycles.length;
  const subtitle = staff
    ? "Build a batch — add recipes, check stock, then start it"
    : openCount > 0
      ? `${openCount} in progress · ${cycleHistory.length + history.length} recent`
      : "Build a batch — add recipes, check stock, then bake & cost it";

  return (
    <OpsShell active="/admin/ops/production" title="Production" subtitle={subtitle}>
      <ProductionPanel
        role={staff ? "staff" : "super_admin"}
        recipes={recipes}
        openBatches={openBatches}
        history={history}
        openCycles={openCycles}
        cycleHistory={cycleHistory}
      />
    </OpsShell>
  );
}
