/** POST /api/admin/ops/purchase/pay — mark a received purchase paid, posting
 *  the ingredient cash-out (Ops M4 Finance / F1 AP settlement). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, markPurchasePaid } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const ACCOUNTS = ["cash", "bank", "marketplace_pending"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { purchaseId?: string; account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
  if (!purchaseId) return NextResponse.json({ error: "missing purchase" }, { status: 400 });
  const account = typeof body.account === "string" && ACCOUNTS.includes(body.account) ? body.account : "bank";

  try {
    const result = await markPurchasePaid(purchaseId, account);
    if (!result) return NextResponse.json({ error: "purchase not found or already paid" }, { status: 404 });
    logOrder("ops_purchase_paid", { purchaseId, account, total: result.total });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logOrder("ops_purchase_paid_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not mark paid — try again." }, { status: 500 });
  }
}
