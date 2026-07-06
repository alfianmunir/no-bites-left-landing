/**
 * GET /api/orders/mine — the signed-in customer's orders (My Orders / tracking).
 * Identity comes from the Supabase session cookie (or the legacy mock session).
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getRequester } from "@/lib/identity";
import { publicOrderView } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const requester = await getRequester();
  if (!requester) return NextResponse.json({ orders: [] });

  const store = getStore();
  await store.init();
  const orders = await store.list({ userId: requester.id });
  // Whitelisted projection — never leak customer PII / callback_log to the client.
  return NextResponse.json({ orders: orders.map(publicOrderView) });
}
