import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import {
  opsEnabled,
  getCashPosition,
  listCashEntries,
  listExpenseCategories,
  listBudgetVsSpend,
  listAssets,
  listPayablePurchases,
  listInvoices,
  listItemsWithStock,
  getPnL,
} from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { OpsShell, DbNotice } from "../OpsChrome";
import MoneyPanel from "./MoneyPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsMoneyPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/money" title="Money">
        <DbNotice />
      </OpsShell>
    );
  }

  const { start, end, label } = monthRange();
  const month = start.slice(0, 7); // "YYYY-MM"

  const [position, entries, categories, budgets, assets, payables, invoices, items, pnl] = await Promise.all([
    getCashPosition(),
    listCashEntries({ month }),
    listExpenseCategories(),
    listBudgetVsSpend(month),
    listAssets(),
    listPayablePurchases(),
    listInvoices(),
    listItemsWithStock(),
    getPnL(start, end),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <OpsShell active="/admin/ops/money" title="Money" subtitle={label}>
      <MoneyPanel
        position={position}
        entries={entries}
        categories={categories}
        budgets={budgets}
        assets={assets}
        payables={payables}
        invoices={invoices}
        items={items}
        pnl={pnl}
        monthLabel={label}
        today={today}
      />
    </OpsShell>
  );
}
