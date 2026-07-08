/** POST /api/admin/ops/asset — asset register CRUD + lifecycle (Ops M4a).
 *  action: create | update | dispose | delete | (default) buy/mark-owned. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, markAssetOwned, createAsset, updateAsset, disposeAsset, deleteAsset } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const ACCOUNTS = ["cash", "bank", "marketplace_pending"];
const CATEGORIES = ["production", "storage", "other"];

interface Body {
  action?: string;
  assetId?: string;
  // create/update fields
  name?: string;
  category?: string;
  status?: string;
  targetMonth?: string | null;
  usefulLifeMonths?: number | string | null;
  salvageValue?: number | string | null;
  // buy fields
  purchaseCost?: number | string | null;
  purchasedAt?: string | null;
  account?: string;
}

function parseCost(v: unknown): number | null | "invalid" {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const action = body.action ?? "buy";

  try {
    // ---- Create --------------------------------------------------------------
    if (action === "create") {
      const name = (body.name ?? "").toString().trim();
      const category = typeof body.category === "string" && CATEGORIES.includes(body.category) ? body.category : "production";
      const status = body.status === "owned" ? "owned" : "planned";
      if (!name) return NextResponse.json({ error: "enter a name" }, { status: 400 });
      const purchaseCost = parseCost(body.purchaseCost);
      if (purchaseCost === "invalid") return NextResponse.json({ error: "enter a valid cost" }, { status: 400 });
      const life = body.usefulLifeMonths == null || body.usefulLifeMonths === "" ? 48 : Number(body.usefulLifeMonths);
      if (!Number.isFinite(life) || life <= 0) return NextResponse.json({ error: "useful life must be greater than 0" }, { status: 400 });
      const salvage = body.salvageValue == null || body.salvageValue === "" ? 0 : Number(body.salvageValue);
      if (!Number.isFinite(salvage) || salvage < 0) return NextResponse.json({ error: "enter a valid salvage value" }, { status: 400 });

      const id = await createAsset({
        name, category, status, purchaseCost, targetMonth: body.targetMonth ?? null,
        usefulLifeMonths: life, salvageValue: salvage, purchasedAt: body.purchasedAt ?? null,
      });
      logOrder("ops_asset_create", { id, status });
      return NextResponse.json({ ok: true, id });
    }

    // ---- Update --------------------------------------------------------------
    if (action === "update") {
      const assetId = typeof body.assetId === "string" ? body.assetId : "";
      const name = (body.name ?? "").toString().trim();
      const category = typeof body.category === "string" && CATEGORIES.includes(body.category) ? body.category : "production";
      if (!assetId) return NextResponse.json({ error: "missing asset" }, { status: 400 });
      if (!name) return NextResponse.json({ error: "enter a name" }, { status: 400 });
      const purchaseCost = parseCost(body.purchaseCost);
      if (purchaseCost === "invalid") return NextResponse.json({ error: "enter a valid cost" }, { status: 400 });
      const life = body.usefulLifeMonths == null || body.usefulLifeMonths === "" ? null : Number(body.usefulLifeMonths);
      if (life != null && (!Number.isFinite(life) || life <= 0)) return NextResponse.json({ error: "useful life must be greater than 0" }, { status: 400 });
      const salvage = body.salvageValue == null || body.salvageValue === "" ? 0 : Number(body.salvageValue);
      if (!Number.isFinite(salvage) || salvage < 0) return NextResponse.json({ error: "enter a valid salvage value" }, { status: 400 });

      const ok = await updateAsset(assetId, { name, category, purchaseCost, targetMonth: body.targetMonth ?? null, usefulLifeMonths: life, salvageValue: salvage });
      if (!ok) return NextResponse.json({ error: "asset not found" }, { status: 404 });
      logOrder("ops_asset_update", { assetId });
      return NextResponse.json({ ok: true });
    }

    // ---- Dispose -------------------------------------------------------------
    if (action === "dispose") {
      const assetId = typeof body.assetId === "string" ? body.assetId : "";
      if (!assetId) return NextResponse.json({ error: "missing asset" }, { status: 400 });
      const ok = await disposeAsset(assetId);
      if (!ok) return NextResponse.json({ error: "asset not found or already disposed" }, { status: 404 });
      logOrder("ops_asset_dispose", { assetId });
      return NextResponse.json({ ok: true });
    }

    // ---- Delete --------------------------------------------------------------
    if (action === "delete") {
      const assetId = typeof body.assetId === "string" ? body.assetId : "";
      if (!assetId) return NextResponse.json({ error: "missing asset" }, { status: 400 });
      const outcome = await deleteAsset(assetId);
      if (outcome === "notfound") return NextResponse.json({ error: "asset not found" }, { status: 404 });
      if (outcome === "blocked") return NextResponse.json({ error: "This asset was bought through the system — dispose it instead (keeps the cash ledger intact)." }, { status: 400 });
      logOrder("ops_asset_delete", { assetId });
      return NextResponse.json({ ok: true, outcome });
    }

    // ---- Buy / mark owned (default) -----------------------------------------
    const assetId = typeof body.assetId === "string" ? body.assetId : "";
    if (!assetId) return NextResponse.json({ error: "missing asset" }, { status: 400 });
    const purchaseCost = parseCost(body.purchaseCost);
    if (purchaseCost === "invalid") return NextResponse.json({ error: "enter a valid purchase cost" }, { status: 400 });
    const account = typeof body.account === "string" && ACCOUNTS.includes(body.account) ? body.account : "bank";
    const result = await markAssetOwned({ assetId, purchaseCost, purchasedAt: body.purchasedAt ?? null, account });
    if (!result) return NextResponse.json({ error: "asset not found or already owned" }, { status: 404 });
    logOrder("ops_asset_owned", { assetId, cost: result.cost, account });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logOrder("ops_asset_failed", { action, error: String(e) });
    return NextResponse.json({ error: "Could not update the asset — try again." }, { status: 500 });
  }
}
