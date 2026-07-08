/** POST /api/admin/ops/attendance/self — a staff member logs their own worked
 *  day (today). Flows into the same attendance the super-admin HR dashboard and
 *  payroll read. No body needed. */
import { NextResponse } from "next/server";
import { getOpsSession } from "@/lib/adminAuth";
import { opsEnabled, logAttendance } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await getOpsSession();
  if (!session || session.role !== "staff" || !session.staffId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  try {
    await logAttendance(session.staffId, today, "self");
    logOrder("ops_attendance_self", { staffId: session.staffId, date: today });
    return NextResponse.json({ ok: true, date: today });
  } catch (e) {
    logOrder("ops_attendance_self_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not log today — try again." }, { status: 500 });
  }
}
