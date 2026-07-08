/** POST /api/admin/ops/price — pricing writes:
 *  - { productId, listPrice }         → adjust a product's list price
 *  - { productId, wasteRate|null, action:'product_waste' } → set/clear per-menu waste
 *  - { generalWasteRate, action:'general_waste' }          → set the general waste rate */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, updateProductPrice, updateProductWasteRate, setGeneralWasteRate } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

// Waste rate arrives as a percent (0–95). Convert to a 0–<1 fraction.
function parseWastePct(v: unknown): number | "invalid" {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 100) return "invalid";
  return n / 100;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { action?: string; productId?: string; listPrice?: number | string; wasteRate?: number | string | null; generalWasteRate?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    // ---- General waste rate --------------------------------------------------
    if (body.action === "general_waste") {
      const frac = parseWastePct(body.generalWasteRate);
      if (frac === "invalid") return NextResponse.json({ error: "enter a waste rate between 0 and 95%" }, { status: 400 });
      await setGeneralWasteRate(frac);
      logOrder("ops_general_waste_update", { wasteRate: frac });
      return NextResponse.json({ ok: true });
    }

    // ---- Per-product waste rate (null clears → inherit general) -------------
    if (body.action === "product_waste") {
      const productId = typeof body.productId === "string" ? body.productId : "";
      if (!productId) return NextResponse.json({ error: "select a product" }, { status: 400 });
      let wasteRate: number | null = null;
      if (body.wasteRate != null && body.wasteRate !== "") {
        const frac = parseWastePct(body.wasteRate);
        if (frac === "invalid") return NextResponse.json({ error: "enter a waste rate between 0 and 95%" }, { status: 400 });
        wasteRate = frac;
      }
      const updated = await updateProductWasteRate(productId, wasteRate);
      if (!updated) return NextResponse.json({ error: "product not found" }, { status: 404 });
      logOrder("ops_product_waste_update", { productId, wasteRate });
      return NextResponse.json({ ok: true, product: updated });
    }

    // ---- List price (default) -----------------------------------------------
    const productId = typeof body.productId === "string" ? body.productId : "";
    const listPrice = Number(body.listPrice);
    if (!productId) return NextResponse.json({ error: "select a product" }, { status: 400 });
    if (!Number.isFinite(listPrice) || listPrice <= 0) return NextResponse.json({ error: "enter a valid price" }, { status: 400 });

    const updated = await updateProductPrice(productId, listPrice);
    if (!updated) return NextResponse.json({ error: "product not found" }, { status: 404 });
    logOrder("ops_price_update", { productId, listPrice });
    return NextResponse.json({ ok: true, product: updated });
  } catch (e) {
    logOrder("ops_price_update_failed", { error: String(e) });
    return NextResponse.json({ error: "Update failed — try again." }, { status: 500 });
  }
}
