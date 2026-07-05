/**
 * GET /api/orders/mine — the signed-in customer's orders (My Orders / tracking).
 * Identity comes from the Supabase session cookie (or the legacy mock session).
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getSupabaseUser } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const authUser = await getSupabaseUser();
  const legacy = authUser ? null : await getSession();
  const userId = authUser?.id ?? legacy?.id ?? null;
  if (!userId) return NextResponse.json({ orders: [] });

  const store = getStore();
  await store.init();
  const orders = await store.list({ userId });
  return NextResponse.json({ orders });
}
