/**
 * GET /api/orders/[id] — single order for the in-drawer status/tracking screen.
 * Read-only; the order id (NBL-<ts>-<rand>) is the unguessable capability, same
 * as the public /order/[id] status page.
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ order });
}
