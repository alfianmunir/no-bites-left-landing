/**
 * Development-only finance preview. This is intentionally separate from the
 * database store so it can never write, merge with, or masquerade as live data.
 */
import type {
  AccrualReport,
  AssetRow,
  BudgetRow,
  CashEntryRow,
  CashPosition,
  ExpenseCategoryRow,
  InvoiceRow,
  ItemDetailRow,
  PayablePurchaseRow,
  ProductRow,
} from "./opsStore";
import type { PnL } from "./opsFinance";

/** Demo data is available only in a non-production runtime and must be
 * explicitly requested by the page (`?demo=1`). */
export const localFinanceDemo = process.env.NODE_ENV !== "production";

export interface DemoMoneyData {
  position: CashPosition;
  entries: CashEntryRow[];
  categories: ExpenseCategoryRow[];
  budgets: BudgetRow[];
  assets: AssetRow[];
  payables: PayablePurchaseRow[];
  invoices: InvoiceRow[];
  items: ItemDetailRow[];
  products: ProductRow[];
  pnl: PnL;
  accounting: AccrualReport;
}

/** Realistic sample records for reviewing the finance screen locally. */
export function getDemoMoneyData(month: string): DemoMoneyData {
  const prefix = `${month}-`;
  const pnl: PnL = {
    revenue: 18_750_000, fees: 420_000, cogs: 7_125_000, grossProfit: 11_625_000,
    labor: 2_200_000, opex: 1_050_000, marketing: 850_000, samples: 150_000,
    rnd: 90_000, waste: 115_000, shrinkage: 35_000, depreciation: 285_000,
    operatingProfit: 6_430_000,
  };
  const assets = [
    { code: "1100", name: "Cash and bank", amount: 22_000_000 },
    { code: "1200", name: "Accounts receivable", amount: 2_500_000 },
    { code: "1300", name: "Inventory", amount: 6_300_000 },
    { code: "1500", name: "Property and equipment, net", amount: 8_400_000 },
  ];
  const liabilities = [{ code: "2100", name: "Accounts payable", amount: 3_100_000 }];
  const equity = [
    { code: "3100", name: "Opening / unclassified equity", amount: 23_670_000 },
    { code: "3300", name: "Retained earnings (operating result to date)", amount: 12_430_000 },
  ];
  const trialBalance = [...assets, ...liabilities, ...equity].map((line) => {
    const debit = line.code.startsWith("1") ? line.amount : 0;
    const credit = line.code.startsWith("1") ? 0 : line.amount;
    return { ...line, debit, credit };
  });

  return {
    position: { accounts: [{ account: "bank", balance: 19_500_000 }, { account: "cash", balance: 2_500_000 }], total: 22_000_000 },
    entries: [
      { id: "demo-1", direction: "in", amount: 4_750_000, account: "bank", category: "sales_website", refType: "sales_order", note: "Website payments", occurredAt: `${prefix}18`, balance: 22_000_000 },
      { id: "demo-2", direction: "out", amount: 1_250_000, account: "bank", category: "ingredients", refType: "purchase", note: "Flour, butter and chocolate", occurredAt: `${prefix}16`, balance: 17_250_000 },
      { id: "demo-3", direction: "out", amount: 850_000, account: "bank", category: "mkt_meta", refType: "expense", note: "Instagram campaign", occurredAt: `${prefix}12`, balance: 18_500_000 },
      { id: "demo-4", direction: "in", amount: 3_200_000, account: "bank", category: "sales_b2b", refType: "invoice", note: "Cafe B2B invoice", occurredAt: `${prefix}08`, balance: 19_350_000 },
    ],
    categories: [
      { id: "demo-opex", code: "opex_rent", name: "Kitchen rent", type: "opex", monthlyBudget: 2_000_000, countInkind: false },
      { id: "demo-mkt", code: "mkt_meta", name: "Meta ads", type: "marketing", monthlyBudget: 1_000_000, countInkind: false },
      { id: "demo-capex", code: "capex_equipment", name: "Kitchen equipment", type: "capex", monthlyBudget: null, countInkind: false },
    ],
    budgets: [
      { code: "opex_rent", name: "Kitchen rent", monthlyBudget: 2_000_000, cashSpent: 1_850_000, inkindSpent: 0, spent: 1_850_000, countInkind: false },
      { code: "mkt_meta", name: "Meta ads", monthlyBudget: 1_000_000, cashSpent: 850_000, inkindSpent: 0, spent: 850_000, countInkind: false },
    ],
    assets: [{ id: "demo-oven", name: "Convection oven", category: "production", status: "owned", purchaseCost: 9_000_000, purchasedAt: `${month}-01`, targetMonth: null, usefulLifeMonths: 36, salvageValue: 0, monthlyDepreciation: 250_000 }],
    payables: [{ id: "demo-payable", supplierName: "Jakarta Baking Supply", invoiceRef: "JBS-0824", receivedAt: `${prefix}17`, dueDate: `${prefix}30`, total: 3_100_000 }],
    invoices: [{ id: "demo-invoice", number: "INV-DEMO-001", salesOrderId: "demo-order", channel: "b2b", customerRef: "Kebagusan Coffee", issuedAt: `${prefix}14`, dueDate: `${prefix}28`, status: "sent", amount: 2_500_000 }],
    items: [], products: [], pnl,
    accounting: {
      periodPnL: pnl, assets, liabilities, equity, trialBalance,
      cashFlow: { operating: 6_000_000, investing: -1_000_000, financing: 0, net: 5_000_000 },
      control: { assets: 39_200_000, liabilitiesAndEquity: 39_200_000, difference: 0, openingBalance: 23_670_000 },
    },
  };
}
