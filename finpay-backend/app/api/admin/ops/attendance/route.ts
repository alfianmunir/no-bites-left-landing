/** POST /api/admin/ops/attendance — log a worked day for a staff member (M5 HR). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, logAttendance } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { staffId?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const staffId = typeof body.staffId === "string" ? body.staffId : "";
  const date = typeof body.date === "string" ? body.date : "";
  if (!staffId) return NextResponse.json({ error: "select a staff member" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "enter a valid date" }, { status: 400 });

  try {
    await logAttendance(staffId, date);
    logOrder("ops_attendance", { staffId, date });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logOrder("ops_attendance_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not log attendance — try again." }, { status: 500 });
  }
}
