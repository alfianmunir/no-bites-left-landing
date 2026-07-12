/**
 * GET /api/pickup-locations — public read for the storefront pickup picker.
 * Returns active locations (incl. `external` marketplace ones) + the pickup
 * settings (same-day cutoff / opening hours) that drive the H+1/H+2 floor.
 */
import { NextResponse } from "next/server";
import { getPickupLocationStore } from "@/lib/pickupLocationStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const store = getPickupLocationStore();
  await store.init();
  const [locations, settings] = await Promise.all([store.listActive(), store.getSettings()]);
  return NextResponse.json({ locations, settings });
}
