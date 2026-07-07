/** POST /api/admin/ops/payroll — run payroll for a period (M5 HR). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, runPayroll } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { period?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const period = typeof body.period === "string" ? body.period : "";
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: "pick a valid period (YYYY-MM)" }, { status: 400 });

  try {
    const result = await runPayroll(period);
    logOrder("ops_payroll_run", { period, ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const already = String(e).includes("already run");
    logOrder("ops_payroll_failed", { period, error: String(e) });
    return NextResponse.json({ error: already ? "Payroll already run for this period." : "Payroll run failed — try again." }, { status: already ? 409 : 500 });
  }
}
