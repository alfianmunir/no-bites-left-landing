/**
 * /api/admin/pickup-locations
 *   GET  — list all pickup locations (incl. inactive) for the admin editor.
 *   POST — create or upsert a location.
 *
 * Admin-gated exactly like the other /api/admin/* routes (super-admin session).
 * Config integrity (README §8) is enforced here: ids unique, rule valid, and at
 * least one active non-external location must always remain.
 */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getPickupLocationStore, validateRule } from "@/lib/pickupLocationStore";
import type { PickupLocation } from "@/lib/pickup";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** After applying `next`, would at least one active non-external location remain? */
function hasLiveCalendarLocation(list: PickupLocation[]): boolean {
  return list.some((l) => l.active && l.rule.type !== "external");
}

export async function GET(): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const store = getPickupLocationStore();
  await store.init();
  const [locations, settings] = await Promise.all([store.list(), store.getSettings()]);
  return NextResponse.json({ locations, settings });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "enter a location name" }, { status: 400 });

  const { rule, error: ruleErr } = validateRule(body.rule);
  if (!rule) return NextResponse.json({ error: ruleErr }, { status: 400 });

  const store = getPickupLocationStore();
  await store.init();
  const existing = await store.list();

  let id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    // Derive a unique slug from the name for new locations.
    const base = slugify(name) || "spot";
    id = base;
    let n = 2;
    while (existing.some((l) => l.id === id)) id = `${base}-${n++}`;
  }
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return NextResponse.json({ error: "invalid id (a-z, 0-9, dash)" }, { status: 400 });

  const area = typeof body.area === "string" ? body.area.trim() : "";
  const active = body.active === undefined ? true : Boolean(body.active);
  const sortOrder = Number.isFinite(Number(body.sortOrder))
    ? Number(body.sortOrder)
    : (existing.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 10);

  const loc: PickupLocation = { id, name, area, rule, active, sortOrder };
  const nextList = [...existing.filter((l) => l.id !== id), loc];
  if (!hasLiveCalendarLocation(nextList)) {
    return NextResponse.json({ error: "keep at least one active non-external location" }, { status: 400 });
  }

  await store.upsert(loc);
  logOrder("pickup_location_upsert", { id, ruleType: rule.type, active });
  return NextResponse.json({ ok: true, location: loc });
}
