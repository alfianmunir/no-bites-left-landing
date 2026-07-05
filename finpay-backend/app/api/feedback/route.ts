/** POST /api/feedback — persists a customer's feedback (DB) + emails ops (Resend). */
import { NextResponse } from "next/server";
import { notifyFeedback } from "@/lib/notify";
import { getLeadStore } from "@/lib/leadStore";
import { logOrder } from "@/lib/log";

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
  const payload = {
    rating,
    name: name.slice(0, 80),
    flavour: typeof body.flavour === "string" ? body.flavour.slice(0, 60) : undefined,
    message: typeof body.message === "string" ? body.message.slice(0, 2000) : undefined,
  };

  // Persist the durable record first (best-effort — don't fail UX on a store hiccup).
  let saved = false;
  try {
    const store = getLeadStore();
    await store.init();
    await store.saveFeedback(payload);
    saved = true;
  } catch (e) {
    logOrder("feedback_save_error", { error: String(e) });
  }

  const result = await notifyFeedback(payload);
  return NextResponse.json({ ok: true, saved, emailed: result.sent });
}
