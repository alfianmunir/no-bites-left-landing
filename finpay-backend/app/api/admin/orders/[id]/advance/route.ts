/**
 * POST /api/admin/orders/[id]/advance — advance one step along the production
 * chain (E2E PRD §5.3 / §7). Sequential only:
 *   PICKUP:   PAID → BAKING → READY_FOR_PICKUP → PICKED_UP
 *   DELIVERY: PAID → BAKING → OUT_FOR_DELIVERY → DELIVERED   (v2, dormant)
 * Marking READY_FOR_PICKUP fires the customer "ready to collect" notification.
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getStore } from "@/lib/db";
import { nextFulfillmentStatus } from "@/lib/orders";
import { notifyCustomerReady } from "@/lib/notify";
import { logActivity } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

// Website single-axis status → friendly stage label + tone (matches the queue UI).
const WEB_LABEL: Record<string, { en: string; id: string; tone: string }> = {
  PAID: { en: "Preparing", id: "Disiapkan", tone: "#f58c21" },
  BAKING: { en: "Packed", id: "Dikemas", tone: "#3b9fd6" },
  READY_FOR_PICKUP: { en: "Ready for pickup", id: "Siap diambil", tone: "#54300b" },
  PICKED_UP: { en: "Picked up", id: "Sudah diambil", tone: "#2d9322" },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  await store.init();
  const order = await store.get(id);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const next = nextFulfillmentStatus(order.status, order.fulfillment);
  if (!next) {
    return NextResponse.json(
      { error: `cannot advance from ${order.status}` },
      { status: 400 },
    );
  }

  const updated = await store.setStatus(id, next, "admin");
  logOrder("admin_advance", { orderId: id, from: order.status, to: next });

  if (next === "READY_FOR_PICKUP" && updated) {
    await notifyCustomerReady(updated);
  }

  const lbl = WEB_LABEL[next];
  if (lbl) {
    const emailed = next === "READY_FOR_PICKUP";
    await logActivity({
      kind: "website_advance",
      messageEn: `Website ${id} → ${lbl.en}${emailed ? " · customer emailed" : ""}`,
      messageId: `Situs ${id} → ${lbl.id}${emailed ? " · email terkirim" : ""}`,
      tone: lbl.tone,
    });
  }

  return NextResponse.json({ order: updated });
}
