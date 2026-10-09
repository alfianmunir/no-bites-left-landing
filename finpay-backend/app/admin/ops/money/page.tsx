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
  listProducts,
  getPnL,
  getAccrualReport,
} from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { getDemoMoneyData, localFinanceDemo } from "@/lib/opsDemo";
import { OpsShell, DbNotice } from "../OpsChrome";
import MoneyPanel from "./MoneyPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsMoneyPage({ searchParams }: { searchParams: Promise<{ month?: string; demo?: string }> }) {
  const params = await searchParams;
  const demo = localFinanceDemo && params.demo === "1";
  if (!demo && !(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/money" title="Money">
        <DbNotice />
      </OpsShell>
    );
  }

  const requestedMonth = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : null;
  const requestedDate = requestedMonth ? new Date(Date.UTC(Number(requestedMonth.slice(0, 4)), Number(requestedMonth.slice(5, 7)) - 1, 1)) : new Date();
  const { start, end, label } = monthRange(requestedDate);
  const month = start.slice(0, 7); // "YYYY-MM"

  if (demo) {
    const demo = getDemoMoneyData(month);
    return (
      <OpsShell active="/admin/ops/money" title="Money" subtitle={`${label} · local demo data`}>
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "#fff3d6", border: "1.5px solid #e6b450", color: "#69430c", fontSize: 13, fontWeight: 700 }}>
          Local demo only — figures are sample data and are never written to the database.
        </div>
        <MoneyPanel {...demo} monthLabel={label} month={month} today={new Date().toISOString().slice(0, 10)} />
      </OpsShell>
    );
  }

  const [position, entries, categories, budgets, assets, payables, invoices, items, products, pnl, accounting] = await Promise.all([
    getCashPosition(),
    listCashEntries({ month }),
    listExpenseCategories(),
    listBudgetVsSpend(month),
    listAssets(),
    listPayablePurchases(),
    listInvoices(),
    listItemsWithStock(),
    listProducts(),
    getPnL(start, end),
    getAccrualReport(start, end),
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
        products={products}
        pnl={pnl}
        accounting={accounting}
        monthLabel={label}
        month={month}
        today={today}
      />
    </OpsShell>
  );
}
