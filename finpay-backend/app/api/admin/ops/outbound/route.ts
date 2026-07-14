/** POST /api/admin/ops/outbound — outbound / write-off flow (Money → Expense).
 *  Burns a raw item, a finished good, or "other" (manual amount), attributes the
 *  cost to a chosen expense category, and keeps both ledgers straight:
 *    - item/product: deducts stock (item ledger) + books a NON-CASH expense
 *      (stock was already paid for on purchase) — no cash entry.
 *    - other: no stock; books a cash-out expense from the chosen account. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, recordOutbound, OUTBOUND_OTHER_CATEGORY, type OutboundKind } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const ACCOUNTS = ["cash", "bank", "marketplace_pending"];
const KINDS: OutboundKind[] = ["item", "product", "other"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: {
    kind?: string;
    categoryId?: string;
    otherLabel?: string | null;
    itemId?: string | null;
    productId?: string | null;
    qty?: number | string | null;
    amount?: number | string | null;
    note?: string | null;
    account?: string;
    occurredAt?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const kind = KINDS.includes(body.kind as OutboundKind) ? (body.kind as OutboundKind) : null;
  if (!kind) return NextResponse.json({ error: "choose what to outbound" }, { status: 400 });

  const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
  if (!categoryId) return NextResponse.json({ error: "select a category" }, { status: 400 });
  if (categoryId === OUTBOUND_OTHER_CATEGORY && !(body.otherLabel && body.otherLabel.trim())) {
    return NextResponse.json({ error: "name the 'Other' category" }, { status: 400 });
  }

  const qty = body.qty == null || body.qty === "" ? null : Number(body.qty);
  const amount = body.amount == null || body.amount === "" ? null : Number(body.amount);
  if ((kind === "item" || kind === "product") && (!Number.isFinite(qty as number) || (qty as number) <= 0)) {
    return NextResponse.json({ error: "enter a quantity greater than 0" }, { status: 400 });
  }
  if (kind === "other" && (!Number.isFinite(amount as number) || (amount as number) <= 0)) {
    return NextResponse.json({ error: "enter an amount greater than 0" }, { status: 400 });
  }

  const account = typeof body.account === "string" && ACCOUNTS.includes(body.account) ? body.account : "bank";

  try {
    const { expenseId, cost } = await recordOutbound({
      kind,
      categoryId,
      otherLabel: body.otherLabel ?? null,
      itemId: typeof body.itemId === "string" ? body.itemId : null,
      productId: typeof body.productId === "string" ? body.productId : null,
      qty,
      amount,
      note: body.note ?? null,
      account,
      occurredAt: body.occurredAt ?? null,
    });
    logOrder("ops_outbound", { kind, categoryId, expenseId, cost });
    return NextResponse.json({ ok: true, expenseId, cost });
  } catch (e) {
    const msg = String(e);
    const known = ["category not found", "select an item", "select a product", "product not found", "enter a quantity greater than 0", "enter an amount greater than 0"];
    const hit = known.find((k) => msg.includes(k));
    logOrder("ops_outbound_failed", { error: msg });
    return NextResponse.json({ error: hit ?? "Could not record the outbound — try again." }, { status: hit ? 400 : 500 });
  }
}
