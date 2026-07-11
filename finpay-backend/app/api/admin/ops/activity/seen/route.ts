/** POST /api/admin/ops/activity/seen — mark the feed read up to now. Stores the
 *  timestamp in a cookie the shell reads to compute the unread badge count. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Cookie the shell reads to compute the unread badge. Keep in sync with OpsChrome.
const ACTIVITY_SEEN_COOKIE = "ops_activity_seen";

export async function POST(): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVITY_SEEN_COOKIE, new Date().toISOString(), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
