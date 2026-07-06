/** POST /api/wholesale — persists a B2B tasting request (DB) + emails ops (Resend). */
import { NextResponse } from "next/server";
import { notifyWholesale } from "@/lib/notify";
import { getLeadStore } from "@/lib/leadStore";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request): Promise<NextResponse> {
  const rl = rateLimit(`wholesale:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  // Honeypot: bots fill hidden fields; humans don't. Pretend success, drop it.
  if (typeof body.hp === "string" && body.hp.trim() !== "") {
    return NextResponse.json({ ok: true, saved: false, emailed: false });
  }
  const name = str(body.name);
  const role = str(body.role, 40);
  const cafe = str(body.cafe);
  const city = str(body.city);
  const contact = str(body.contact, 60);
  if (!name || !role || !cafe || !city || !contact) {
    return NextResponse.json({ error: "name, role, cafe, city and contact are required" }, { status: 400 });
  }
  const payload = { name, role, cafe, city, contact, volume: str(body.volume, 40) || undefined };

  let saved = false;
  try {
    const store = getLeadStore();
    await store.init();
    await store.saveWholesale(payload);
    saved = true;
  } catch (e) {
    logOrder("wholesale_save_error", { error: String(e) });
  }

  const result = await notifyWholesale(payload);
  return NextResponse.json({ ok: true, saved, emailed: result.sent });
}
