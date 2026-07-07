/** POST /api/admin/ops/item — item master CRUD (goods/packaging). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, createItem, updateItem, deleteOrDeactivateItem } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const TYPES = ["ingredient", "packaging"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: {
    action?: string;
    id?: string;
    name?: string;
    type?: string;
    unit?: string;
    reorderPoint?: number | string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const reorderPoint = body.reorderPoint == null || body.reorderPoint === "" ? null : Number(body.reorderPoint);
  if (reorderPoint != null && (!Number.isFinite(reorderPoint) || reorderPoint < 0)) return NextResponse.json({ error: "invalid reorder point" }, { status: 400 });

  try {
    if (body.action === "delete") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "missing item" }, { status: 400 });
      const outcome = await deleteOrDeactivateItem(id);
      if (outcome === "notfound") return NextResponse.json({ error: "item not found" }, { status: 404 });
      logOrder("ops_item_delete", { id, outcome });
      return NextResponse.json({ ok: true, outcome });
    }

    const name = (body.name ?? "").toString().trim();
    const unit = (body.unit ?? "").toString().trim();
    if (!name) return NextResponse.json({ error: "enter a name" }, { status: 400 });
    if (!unit) return NextResponse.json({ error: "enter a unit (g / ml / pcs)" }, { status: 400 });

    if (body.action === "update") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "missing item" }, { status: 400 });
      const ok = await updateItem(id, { name, unit, reorderPoint });
      if (!ok) return NextResponse.json({ error: "item not found" }, { status: 404 });
      logOrder("ops_item_update", { id });
      return NextResponse.json({ ok: true });
    }

    // create
    const type = typeof body.type === "string" ? body.type : "";
    if (!TYPES.includes(type)) return NextResponse.json({ error: "pick a category" }, { status: 400 });
    const id = await createItem({ name, type, unit, reorderPoint });
    logOrder("ops_item_create", { id, type });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    logOrder("ops_item_failed", { error: String(e) });
    return NextResponse.json({ error: "Save failed — try again." }, { status: 500 });
  }
}
