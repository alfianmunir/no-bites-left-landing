/** POST /api/admin/wholesale/[id]/followup — flag/unflag a request as followed up. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { getLeadStore } from "@/lib/leadStore";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const value = body.value === true;

  const store = getLeadStore();
  await store.init();
  await store.setWholesaleFollowedUp(id, value);
  return NextResponse.json({ ok: true, followedUp: value });
}
