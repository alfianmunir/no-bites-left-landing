/**
 * POST /api/admin/orders/bulk-advance — advance MANY website orders forward to a
 * target status in one action (the bulk bar on the ops website-orders queue).
 *
 * Body: { orderIds: string[], target: "BAKING" | "READY_FOR_PICKUP" | "PICKED_UP" }
 *
 * Forward-only by construction: each order is walked step-by-step via
 * nextFulfillmentStatus until it reaches the target, so an order already at or
 * past the target (or not on the production chain, e.g. PENDING/EXPIRED) is
 * skipped — a bulk action can never move an order backward. The customer
 * "ready to collect" email fires only when the FINAL state is READY_FOR_PICKUP
 * (bulk-marking picked-up is a backfill; no stale "come collect" email).
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { progressionFor, nextFulfillmentStatus, type OrderStatus } from "@/lib/orders";
import { notifyCustomerReady } from "@/lib/notify";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const TARGETS: ReadonlySet<string> = new Set(["BAKING", "READY_FOR_PICKUP", "PICKED_UP"]);
const MAX_ORDERS = 100;

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { orderIds?: unknown; target?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const target = typeof body.target === "string" ? (body.target as OrderStatus) : null;
  if (!target || !TARGETS.has(target)) {
    return NextResponse.json({ error: "target must be BAKING | READY_FOR_PICKUP | PICKED_UP" }, { status: 400 });
  }
  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter((x): x is string => typeof x === "string") : [];
  if (orderIds.length === 0) return NextResponse.json({ error: "orderIds must be a non-empty array" }, { status: 400 });
  if (orderIds.length > MAX_ORDERS) return NextResponse.json({ error: `too many orders (max ${MAX_ORDERS})` }, { status: 400 });

  const store = getStore();
  await store.init();

  let advanced = 0;
  let skipped = 0;
  for (const id of orderIds) {
    const order = await store.get(id);
    if (!order) { skipped++; continue; }
    const chain = progressionFor(order.fulfillment);
    const from = chain.indexOf(order.status);
    const to = chain.indexOf(target);
    // Not on the chain (PENDING/EXPIRED/…), target not applicable, or already
    // at/past the target — never step backward.
    if (from === -1 || to === -1 || from >= to) { skipped++; continue; }

    let current = order;
    let status: OrderStatus | null = order.status;
    while (status && status !== target) {
      status = nextFulfillmentStatus(status, order.fulfillment);
      if (!status) break;
      const updated = await store.setStatus(id, status, "admin");
      if (!updated) break;
      current = updated;
    }
    logOrder("admin_bulk_advance", { orderId: id, from: order.status, to: current.status });
    if (current.status === "READY_FOR_PICKUP" && target === "READY_FOR_PICKUP") {
      await notifyCustomerReady(current);
    }
    advanced++;
  }

  return NextResponse.json({ advanced, skipped });
}
