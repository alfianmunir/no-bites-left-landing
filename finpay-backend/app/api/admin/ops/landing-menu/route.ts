/** POST /api/admin/ops/landing-menu — storefront menu CRUD (menu_items).
 *  Actions: upsert { item } · delete { sku }.
 *
 *  SECURITY: menu_items is the server-side price source of truth for
 *  POST /api/orders, so this is super-admin gated and an available item must
 *  carry a positive integer price.
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getMenuStore, type MenuItem } from "@/lib/menuStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

function str(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; sku?: unknown; item?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const store = getMenuStore();
  await store.init();

  try {
    if (body.action === "delete") {
      const sku = str(body.sku, 60);
      if (!sku) return NextResponse.json({ error: "sku is required" }, { status: 400 });
      await store.remove(sku);
      logOrder("landing_menu_delete", { sku });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "upsert") {
      const raw = body.item ?? {};
      const sku = str(raw.sku, 60);
      if (!sku || !/^[a-z0-9-]+$/.test(sku)) {
        return NextResponse.json({ error: "sku must be lowercase letters/digits/dashes" }, { status: 400 });
      }
      const name = str(raw.name);
      const family = str(raw.family, 60) ?? sku;
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

      const available = raw.available === true;
      let unitPrice: number | null = null;
      if (raw.unitPrice !== null && raw.unitPrice !== undefined && raw.unitPrice !== "") {
        const n = Number(raw.unitPrice);
        if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: "price must be a positive integer (IDR)" }, { status: 400 });
        unitPrice = n;
      }
      // An orderable item must have a price — this table prices real orders.
      if (available && unitPrice == null) {
        return NextResponse.json({ error: "an available item needs a price (or mark it coming-soon)" }, { status: 400 });
      }

      const sortOrder = Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0;
      const item: MenuItem = {
        sku,
        family,
        name,
        variant: str(raw.variant, 60),
        unitPrice,
        image: str(raw.image) ?? "/images/menu-og-c.png",
        accent: str(raw.accent, 20) ?? "#54300b",
        tag: str(raw.tag, 60),
        tagId: str(raw.tagId, 60),
        note: str(raw.note),
        noteId: str(raw.noteId),
        description: str(raw.description, 500),
        descriptionId: str(raw.descriptionId, 500),
        available,
        sortOrder,
      };
      await store.upsert(item);
      logOrder("landing_menu_upsert", { sku, available, unitPrice });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    logOrder("landing_menu_failed", { error: String(e) });
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
