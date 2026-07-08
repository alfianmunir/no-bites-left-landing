import { redirect } from "next/navigation";
import { isOpsUser } from "@/lib/adminAuth";
import { opsEnabled, listItems, listSuppliers } from "@/lib/opsStore";
import { OpsShell, DbNotice } from "../OpsChrome";
import ReceiveForm from "./ReceiveForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsReceivePage() {
  if (!(await isOpsUser())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/receive" title="Receive PO">
        <DbNotice />
      </OpsShell>
    );
  }

  const [items, suppliers] = await Promise.all([listItems(), listSuppliers()]);

  return (
    <OpsShell active="/admin/ops/receive" title="Receive PO" subtitle="Log a delivery — creates lots + rolls the moving-average cost">
      <ReceiveForm items={items} suppliers={suppliers} />
    </OpsShell>
  );
}
