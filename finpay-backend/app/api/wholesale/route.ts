/** POST /api/wholesale — emails a B2B tasting request to ops (Resend). */
import { NextResponse } from "next/server";
import { notifyWholesale } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = str(body.name);
  const role = str(body.role, 40);
  const cafe = str(body.cafe);
  const city = str(body.city);
  const contact = str(body.contact, 60);
  if (!name || !role || !cafe || !city || !contact) {
    return NextResponse.json({ error: "name, role, cafe, city and contact are required" }, { status: 400 });
  }
  const result = await notifyWholesale({ name, role, cafe, city, contact, volume: str(body.volume, 40) || undefined });
  return NextResponse.json({ ok: true, emailed: result.sent });
}
