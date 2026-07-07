/** POST /api/admin/ops/recipe — recipe/BOM CRUD (adjustable menu). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import {
  opsEnabled,
  createRecipe,
  updateRecipeYield,
  addRecipeLine,
  updateRecipeLine,
  deleteRecipeLine,
  deleteOrDeactivateRecipe,
} from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: {
    action?: string;
    recipeId?: string;
    productId?: string;
    lineId?: string;
    itemId?: string;
    qty?: number | string;
    batchYieldQty?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const qty = Number(body.qty);
  const yieldQty = Number(body.batchYieldQty);

  try {
    switch (body.action) {
      case "createRecipe": {
        if (!body.productId) return NextResponse.json({ error: "missing product" }, { status: 400 });
        if (!Number.isFinite(yieldQty) || yieldQty <= 0) return NextResponse.json({ error: "enter a batch yield greater than 0" }, { status: 400 });
        const recipeId = await createRecipe(body.productId, yieldQty);
        logOrder("ops_recipe_create", { recipeId, productId: body.productId });
        return NextResponse.json({ ok: true, recipeId });
      }
      case "updateYield": {
        if (!body.recipeId) return NextResponse.json({ error: "missing recipe" }, { status: 400 });
        if (!Number.isFinite(yieldQty) || yieldQty <= 0) return NextResponse.json({ error: "enter a batch yield greater than 0" }, { status: 400 });
        const ok = await updateRecipeYield(body.recipeId, yieldQty);
        if (!ok) return NextResponse.json({ error: "recipe not found" }, { status: 404 });
        logOrder("ops_recipe_yield", { recipeId: body.recipeId, yieldQty });
        return NextResponse.json({ ok: true });
      }
      case "addLine": {
        if (!body.recipeId || !body.itemId) return NextResponse.json({ error: "pick an item" }, { status: 400 });
        if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "enter a quantity greater than 0" }, { status: 400 });
        const lineId = await addRecipeLine(body.recipeId, body.itemId, qty);
        logOrder("ops_recipe_add_line", { recipeId: body.recipeId, itemId: body.itemId });
        return NextResponse.json({ ok: true, lineId });
      }
      case "updateLine": {
        if (!body.lineId) return NextResponse.json({ error: "missing line" }, { status: 400 });
        if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "enter a quantity greater than 0" }, { status: 400 });
        const ok = await updateRecipeLine(body.lineId, qty);
        if (!ok) return NextResponse.json({ error: "line not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      case "deleteLine": {
        if (!body.lineId) return NextResponse.json({ error: "missing line" }, { status: 400 });
        const ok = await deleteRecipeLine(body.lineId);
        if (!ok) return NextResponse.json({ error: "line not found" }, { status: 404 });
        logOrder("ops_recipe_delete_line", { lineId: body.lineId });
        return NextResponse.json({ ok: true });
      }
      case "deleteRecipe": {
        if (!body.recipeId) return NextResponse.json({ error: "missing recipe" }, { status: 400 });
        const outcome = await deleteOrDeactivateRecipe(body.recipeId);
        if (outcome === "notfound") return NextResponse.json({ error: "recipe not found" }, { status: 404 });
        logOrder("ops_recipe_delete", { recipeId: body.recipeId, outcome });
        return NextResponse.json({ ok: true, outcome });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    logOrder("ops_recipe_failed", { action: body.action, error: String(e) });
    return NextResponse.json({ error: "Save failed — try again." }, { status: 500 });
  }
}
