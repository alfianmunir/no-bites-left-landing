import { NextResponse } from "next/server";
import { verifyAdminPassword, encodeAdminSession, ADMIN_COOKIE, type OpsRole } from "@/lib/adminAuth";
import { opsEnabled, findStaffLogin } from "@/lib/opsStore";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const password = body.password ?? "";

  // Super-admin (shared env password) first; otherwise try per-staff logins.
  let cookieValue: string | null = null;
  let role: OpsRole = "super_admin";
  if (verifyAdminPassword(password)) {
    cookieValue = encodeAdminSession("super_admin");
  } else if (opsEnabled) {
    const staff = await findStaffLogin(password);
    if (staff) {
      cookieValue = encodeAdminSession("staff", staff.id);
      role = "staff";
    }
  }

  if (!cookieValue) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(ADMIN_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}
