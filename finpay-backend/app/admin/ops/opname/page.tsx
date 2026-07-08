import { redirect } from "next/navigation";
import { isOpsUser } from "@/lib/adminAuth";
import { opsEnabled, listStockBalance } from "@/lib/opsStore";
import { OpsShell, DbNotice } from "../OpsChrome";
import OpnameForm from "./OpnameForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsOpnamePage() {
  if (!(await isOpsUser())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/opname" title="Stock opname">
        <DbNotice />
      </OpsShell>
    );
  }

  const balance = await listStockBalance();

  return (
    <OpsShell active="/admin/ops/opname" title="Stock opname" subtitle="Count an item — the variance posts as an adjustment move">
      <OpnameForm balance={balance} />
    </OpsShell>
  );
}
