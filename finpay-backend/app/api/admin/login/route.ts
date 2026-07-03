import { NextResponse } from "next/server";
import { verifyAdminPassword, encodeAdminSession, ADMIN_COOKIE } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!verifyAdminPassword(body.password ?? "")) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, encodeAdminSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}
