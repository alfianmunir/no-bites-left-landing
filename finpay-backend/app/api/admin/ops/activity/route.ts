/** GET /api/admin/ops/activity — recent activity feed + notify-channel state. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listActivity, getNotifyChannels } from "@/lib/opsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ activities: [], channels: { whatsapp: false, email: false } });
  const [activities, channels] = await Promise.all([listActivity(50), getNotifyChannels()]);
  return NextResponse.json({ activities, channels });
}
