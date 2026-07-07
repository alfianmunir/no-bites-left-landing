import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listStaff, getPayrollPreview, listPayrollRuns } from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { OpsShell, DbNotice } from "../OpsChrome";
import TeamPanel from "./TeamPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsTeamPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/team" title="Team">
        <DbNotice />
      </OpsShell>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { period: rawPeriod } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(rawPeriod ?? "") ? (rawPeriod as string) : monthRange().start.slice(0, 7);

  const [staff, payroll, runs] = await Promise.all([listStaff(), getPayrollPreview(period), listPayrollRuns()]);
  const activeCount = staff.filter((s) => s.active).length;

  return (
    <OpsShell active="/admin/ops/team" title="Team" subtitle={`${activeCount} active · payroll ${period}`}>
      <TeamPanel
        staff={staff}
        preview={payroll.lines}
        period={period}
        total={payroll.total}
        thrTotal={payroll.thrTotal}
        alreadyRun={payroll.alreadyRun}
        runs={runs}
        today={today}
      />
    </OpsShell>
  );
}
