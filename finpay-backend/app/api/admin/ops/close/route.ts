/** POST /api/admin/ops/close — monthly close: post the current month's
 *  depreciation as a non-cash opex expense (Audit H3). Idempotent per month.
 *  Optional body { period: "YYYY-MM" }; defaults to the current month. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, postDepreciation } from "@/lib/opsStore";
import { monthRange } from "@/lib/opsFinance";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let period = monthRange().start.slice(0, 7); // "YYYY-MM"
  try {
    const body = (await req.json()) as { period?: string };
    if (typeof body?.period === "string" && /^\d{4}-\d{2}$/.test(body.period)) period = body.period;
  } catch {
    // no body → current month
  }

  try {
    const r = await postDepreciation(period);
    logOrder("ops_close_depreciation", { period, ...r });
    return NextResponse.json({ ok: true, period, ...r });
  } catch (e) {
    logOrder("ops_close_depreciation_failed", { period, error: String(e) });
    return NextResponse.json({ error: "Could not post depreciation — try again." }, { status: 500 });
  }
}
