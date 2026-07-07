/** GET /api/admin/ops/batch/requirements?recipeId=&plannedQty= — scaled BOM vs stock. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, getRecipeRequirements } from "@/lib/opsStore";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  const url = new URL(req.url);
  const recipeId = url.searchParams.get("recipeId") ?? "";
  const plannedQty = Number(url.searchParams.get("plannedQty"));
  if (!recipeId) return NextResponse.json({ error: "recipeId required" }, { status: 400 });
  if (!Number.isFinite(plannedQty) || plannedQty <= 0) return NextResponse.json({ error: "plannedQty must be > 0" }, { status: 400 });

  try {
    const requirements = await getRecipeRequirements(recipeId, plannedQty);
    return NextResponse.json({ ok: true, requirements });
  } catch {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
