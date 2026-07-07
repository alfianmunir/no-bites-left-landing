/** POST /api/admin/ops/expense — record an opex/marketing/capex expense + its
 *  paired cash-out entry (Ops M4 Finance). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, createExpense } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const ACCOUNTS = ["cash", "bank", "marketplace_pending"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: {
    categoryId?: string;
    amount?: number | string;
    vendor?: string | null;
    note?: string | null;
    campaignRef?: string | null;
    occurredAt?: string | null;
    recurring?: boolean;
    account?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
  if (!categoryId) return NextResponse.json({ error: "select a category" }, { status: 400 });

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "enter an amount greater than 0" }, { status: 400 });

  const account = typeof body.account === "string" && ACCOUNTS.includes(body.account) ? body.account : "bank";

  try {
    const { expenseId } = await createExpense({
      categoryId,
      amount,
      vendor: body.vendor ?? null,
      note: body.note ?? null,
      campaignRef: body.campaignRef ?? null,
      occurredAt: body.occurredAt ?? null,
      recurring: Boolean(body.recurring),
      account,
    });
    logOrder("ops_expense_create", { expenseId, amount, account });
    return NextResponse.json({ ok: true, expenseId });
  } catch (e) {
    const msg = String(e).includes("category not found") ? "category not found" : "Could not record the expense — try again.";
    logOrder("ops_expense_failed", { error: String(e) });
    return NextResponse.json({ error: msg }, { status: msg === "category not found" ? 400 : 500 });
  }
}
