/** POST /api/feedback — emails a customer's feedback to ops (Resend). */
import { NextResponse } from "next/server";
import { notifyFeedback } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { rating?: unknown; name?: unknown; flavour?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const rating = Number(body.rating);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "name and a 1-5 rating are required" }, { status: 400 });
  }
  const result = await notifyFeedback({
    rating,
    name: name.slice(0, 80),
    flavour: typeof body.flavour === "string" ? body.flavour.slice(0, 60) : undefined,
    message: typeof body.message === "string" ? body.message.slice(0, 2000) : undefined,
  });
  // Don't fail the UX if email delivery is unconfigured — the submission is
  // still acknowledged; the reason is logged server-side.
  return NextResponse.json({ ok: true, emailed: result.sent });
}
