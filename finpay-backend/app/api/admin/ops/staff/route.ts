/** POST /api/admin/ops/staff — create a staff member or toggle active (M5 HR). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, createStaff, setStaffActive, setStaffPassword, disableStaffLogin } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const ROLES = ["baker", "packer", "officer", "admin"];
const PAY_TYPES = ["monthly", "daily", "per_batch"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: {
    action?: string;
    staffId?: string;
    active?: boolean;
    name?: string;
    role?: string;
    payType?: string;
    rate?: number | string;
    batchBonus?: number | string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "toggle") {
      const staffId = typeof body.staffId === "string" ? body.staffId : "";
      if (!staffId) return NextResponse.json({ error: "missing staff" }, { status: 400 });
      const ok = await setStaffActive(staffId, body.active !== false);
      if (!ok) return NextResponse.json({ error: "staff not found" }, { status: 404 });
      logOrder("ops_staff_toggle", { staffId, active: body.active !== false });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "setlogin") {
      const staffId = typeof body.staffId === "string" ? body.staffId : "";
      const password = (body.password ?? "").toString();
      if (!staffId) return NextResponse.json({ error: "missing staff" }, { status: 400 });
      if (password.length < 4) return NextResponse.json({ error: "password must be at least 4 characters" }, { status: 400 });
      const ok = await setStaffPassword(staffId, password);
      if (!ok) return NextResponse.json({ error: "staff not found" }, { status: 404 });
      logOrder("ops_staff_setlogin", { staffId });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "disablelogin") {
      const staffId = typeof body.staffId === "string" ? body.staffId : "";
      if (!staffId) return NextResponse.json({ error: "missing staff" }, { status: 400 });
      const ok = await disableStaffLogin(staffId);
      if (!ok) return NextResponse.json({ error: "staff not found" }, { status: 404 });
      logOrder("ops_staff_disablelogin", { staffId });
      return NextResponse.json({ ok: true });
    }

    // create
    const name = (body.name ?? "").toString().trim();
    const role = typeof body.role === "string" ? body.role : "";
    const payType = typeof body.payType === "string" ? body.payType : "";
    const rate = Number(body.rate);
    const batchBonus = body.batchBonus == null || body.batchBonus === "" ? 0 : Number(body.batchBonus);
    if (!name) return NextResponse.json({ error: "enter a name" }, { status: 400 });
    if (!ROLES.includes(role)) return NextResponse.json({ error: "pick a role" }, { status: 400 });
    if (!PAY_TYPES.includes(payType)) return NextResponse.json({ error: "pick a pay type" }, { status: 400 });
    if (!Number.isFinite(rate) || rate < 0) return NextResponse.json({ error: "enter a valid rate" }, { status: 400 });
    if (!Number.isFinite(batchBonus) || batchBonus < 0) return NextResponse.json({ error: "invalid batch bonus" }, { status: 400 });

    const staffId = await createStaff({ name, role, payType, rate, batchBonus });
    logOrder("ops_staff_create", { staffId, role, payType });
    return NextResponse.json({ ok: true, staffId });
  } catch (e) {
    logOrder("ops_staff_failed", { error: String(e) });
    return NextResponse.json({ error: "Save failed — try again." }, { status: 500 });
  }
}
