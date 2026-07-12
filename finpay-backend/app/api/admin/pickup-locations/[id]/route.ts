/**
 * /api/admin/pickup-locations/[id]
 *   PATCH  — update one location (name / area / rule / active / sortOrder).
 *   DELETE — remove one location.
 *
 * Admin-gated. Config integrity (README §8): at least one active non-external
 * location must remain after the change.
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getPickupLocationStore, validateRule } from "@/lib/pickupLocationStore";
import type { PickupLocation } from "@/lib/pickup";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasLiveCalendarLocation(list: PickupLocation[]): boolean {
  return list.some((l) => l.active && l.rule.type !== "external");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const store = getPickupLocationStore();
  await store.init();
  const current = await store.get(id);
  if (!current) return NextResponse.json({ error: "location not found" }, { status: 404 });

  let rule = current.rule;
  if (body.rule !== undefined) {
    const { rule: r, error } = validateRule(body.rule);
    if (!r) return NextResponse.json({ error }, { status: 400 });
    rule = r;
  }

  const name = typeof body.name === "string" ? body.name.trim() : current.name;
  if (!name) return NextResponse.json({ error: "enter a location name" }, { status: 400 });

  const next: PickupLocation = {
    id: current.id,
    name,
    area: typeof body.area === "string" ? body.area.trim() : current.area,
    rule,
    active: body.active === undefined ? current.active : Boolean(body.active),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : current.sortOrder,
  };

  const all = await store.list();
  const nextList = all.map((l) => (l.id === id ? next : l));
  if (!hasLiveCalendarLocation(nextList)) {
    return NextResponse.json({ error: "keep at least one active non-external location" }, { status: 400 });
  }

  await store.upsert(next);
  logOrder("pickup_location_update", { id, ruleType: rule.type, active: next.active });
  return NextResponse.json({ ok: true, location: next });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const store = getPickupLocationStore();
  await store.init();
  const current = await store.get(id);
  if (!current) return NextResponse.json({ error: "location not found" }, { status: 404 });

  const remaining = (await store.list()).filter((l) => l.id !== id);
  if (!hasLiveCalendarLocation(remaining)) {
    return NextResponse.json({ error: "keep at least one active non-external location" }, { status: 400 });
  }

  await store.remove(id);
  logOrder("pickup_location_delete", { id });
  return NextResponse.json({ ok: true });
}
