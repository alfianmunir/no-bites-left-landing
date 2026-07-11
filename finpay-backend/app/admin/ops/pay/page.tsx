import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getOpsSession } from "@/lib/adminAuth";
import { OPS_STR, opsLangFromCookie } from "@/lib/opsI18n";
import { opsEnabled, listStaffPayments, getStaffPaymentSummary } from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { OpsShell, DbNotice } from "../OpsChrome";
import { MyPaySelf, MyPayAll } from "./MyPay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** My Pay (HANDOFF §1.5.5). Staff see ONLY their own earnings/accruals — the
 *  filter is applied server-side by session.staffId, never trusting the client.
 *  Super-admin sees every staff member. */
export default async function OpsPayPage() {
  const session = await getOpsSession();
  if (!session) redirect("/admin/login");

  const L = OPS_STR[opsLangFromCookie((await cookies()).get("ops_lang")?.value)];

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/pay" title={L.scr.pay}>
        <DbNotice />
      </OpsShell>
    );
  }

  const month = monthRange();

  if (session.role === "staff") {
    if (!session.staffId) redirect("/admin/login");
    const [summaries, payments] = await Promise.all([
      getStaffPaymentSummary(session.staffId),
      listStaffPayments(session.staffId),
    ]);
    return (
      <OpsShell active="/admin/ops/pay" title={L.scr.pay} subtitle={month.label}>
        <MyPaySelf summary={summaries[0] ?? null} payments={payments} />
      </OpsShell>
    );
  }

  const [summaries, payments] = await Promise.all([getStaffPaymentSummary(), listStaffPayments()]);
  return (
    <OpsShell active="/admin/ops/pay" title={L.scr.pay} subtitle={month.label}>
      <MyPayAll summaries={summaries} payments={payments} />
    </OpsShell>
  );
}
