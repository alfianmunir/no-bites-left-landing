/**
 * PATCH /api/admin/pickup-settings — update the same-day cutoff + opening hours
 * that drive the H+1/H+2 pickup floor. Single-row settings (README §2).
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getPickupLocationStore, validateSettingsPatch } from "@/lib/pickupLocationStore";
import type { PickupSettings } from "@/lib/pickup";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const patch: Partial<PickupSettings> = {};
  if (typeof body.sameDayCutoffWib === "string") patch.sameDayCutoffWib = body.sameDayCutoffWib.trim();
  if (typeof body.openFromWib === "string") patch.openFromWib = body.openFromWib.trim();
  if (typeof body.openToWib === "string") patch.openToWib = body.openToWib.trim();

  const { error } = validateSettingsPatch(patch);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const store = getPickupLocationStore();
  await store.init();
  const settings = await store.setSettings(patch);
  logOrder("pickup_settings_update", { ...patch });
  return NextResponse.json({ ok: true, settings });
}
