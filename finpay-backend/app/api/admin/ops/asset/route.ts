/** POST /api/admin/ops/asset — mark a planned asset owned, recording the capex
 *  purchase + posting the capex cash-out (Ops M4a asset register). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, markAssetOwned } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const ACCOUNTS = ["cash", "bank", "marketplace_pending"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { assetId?: string; purchaseCost?: number | string | null; purchasedAt?: string | null; account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  if (!assetId) return NextResponse.json({ error: "missing asset" }, { status: 400 });

  let purchaseCost: number | null = null;
  if (body.purchaseCost != null && body.purchaseCost !== "") {
    const n = Number(body.purchaseCost);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "enter a valid purchase cost" }, { status: 400 });
    purchaseCost = n;
  }
  const account = typeof body.account === "string" && ACCOUNTS.includes(body.account) ? body.account : "bank";

  try {
    const result = await markAssetOwned({ assetId, purchaseCost, purchasedAt: body.purchasedAt ?? null, account });
    if (!result) return NextResponse.json({ error: "asset not found or already owned" }, { status: 404 });
    logOrder("ops_asset_owned", { assetId, cost: result.cost, account });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logOrder("ops_asset_owned_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not update the asset — try again." }, { status: 500 });
  }
}
