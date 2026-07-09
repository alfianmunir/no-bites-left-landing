/** POST /api/admin/ops/menu-map — link a storefront menu SKU to an ops product
 *  (+ qty multiplier), or clear it (productId null). Feeds the website→ops flow. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, setMenuMap } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { menuSku?: string; productId?: string | null; qtyPer?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const menuSku = typeof body.menuSku === "string" ? body.menuSku : "";
  if (!menuSku) return NextResponse.json({ error: "missing menu item" }, { status: 400 });

  const productId = typeof body.productId === "string" && body.productId ? body.productId : null;
  let qtyPer = 1;
  if (productId) {
    qtyPer = Number(body.qtyPer);
    if (!Number.isFinite(qtyPer) || qtyPer <= 0) return NextResponse.json({ error: "quantity must be greater than 0" }, { status: 400 });
  }

  try {
    await setMenuMap(menuSku, productId, qtyPer);
    logOrder("ops_menu_map", { menuSku, productId, qtyPer });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logOrder("ops_menu_map_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not save the mapping — try again." }, { status: 500 });
  }
}
