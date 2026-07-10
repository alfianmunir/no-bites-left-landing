/** POST /api/admin/ops/notify-channel — toggle an activity notify channel.
 *  Body: { channel: "whatsapp" | "email", enabled: boolean }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, setNotifyChannel } from "@/lib/opsStore";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { channel?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (body.channel !== "whatsapp" && body.channel !== "email") {
    return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  }
  try {
    const channels = await setNotifyChannel(body.channel, Boolean(body.enabled));
    return NextResponse.json({ channels });
  } catch {
    // Most likely the Phase 11 migration hasn't been applied yet.
    return NextResponse.json({ error: "Could not update the notify setting — try again." }, { status: 500 });
  }
}
