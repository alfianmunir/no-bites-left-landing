/**
 * GET /api/menu — the menu grouped by family for the landing menu section.
 * Public read. Prices are display-only here; POST /api/orders always recomputes
 * server-side from the same store.
 */
import { NextResponse } from "next/server";
import { getMenuStore } from "@/lib/menuStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FamilyGroup {
  family: string;
  name: string;
  image: string;
  accent: string;
  tag: string | null;
  tagId: string | null;
  note: string | null;
  noteId: string | null;
  description: string | null;
  descriptionId: string | null;
  available: boolean;
  variants: { sku: string; variant: string | null; unitPrice: number }[];
}

export async function GET(): Promise<NextResponse> {
  const store = getMenuStore();
  await store.init();
  const items = await store.list(); // ordered by sort_order, sku

  const byFamily = new Map<string, FamilyGroup>();
  for (const m of items) {
    let g = byFamily.get(m.family);
    if (!g) {
      g = {
        family: m.family, name: m.name, image: m.image, accent: m.accent,
        tag: m.tag, tagId: m.tagId, note: m.note, noteId: m.noteId,
        description: m.description, descriptionId: m.descriptionId,
        available: false, variants: [],
      };
      byFamily.set(m.family, g);
    }
    if (m.available && m.unitPrice != null) {
      g.variants.push({ sku: m.sku, variant: m.variant, unitPrice: m.unitPrice });
      g.available = true;
    }
  }

  return NextResponse.json({ menu: [...byFamily.values()] });
}
