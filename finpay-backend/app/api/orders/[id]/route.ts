/**
 * GET /api/orders/[id] — single order for the in-drawer status/tracking screen.
 *
 * SECURITY: scoped to the owner (order.user_id must match the signed-in
 * requester) and returns a whitelisted, PII-free projection. Order ids are
 * enumerable, so this must NOT leak another customer's order. Unknown vs
 * not-owned are both 404 so existence isn't revealed.
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getRequester } from "@/lib/identity";
import { publicOrderView } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const requester = await getRequester();
  if (!requester) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order || order.user_id !== requester.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ order: publicOrderView(order) });
}
