/** POST /api/feedback — persists a customer's feedback (DB) + emails ops (Resend). */
import { NextResponse } from "next/server";
import { notifyFeedback } from "@/lib/notify";
import { getLeadStore } from "@/lib/leadStore";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { verifyCaptcha } from "@/lib/captcha";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — public reviews for the feedback showcase (4★+, non-empty message). */
export async function GET(): Promise<NextResponse> {
  try {
    const store = getLeadStore();
    await store.init();
    const reviews = await store.listFeedback({ minRating: 4, limit: 50 });
    return NextResponse.json({
      reviews: reviews.map((r) => ({ name: r.name, rating: r.rating, flavour: r.flavour, message: r.message, createdAt: r.createdAt })),
    });
  } catch (e) {
    logOrder("feedback_list_error", { error: String(e) });
    return NextResponse.json({ reviews: [] });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // Abuse control: cap submissions per IP (mitigates mail-bomb / DB spam).
  const rl = rateLimit(`feedback:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  let body: { rating?: unknown; name?: unknown; flavour?: unknown; message?: unknown; hp?: unknown; captchaToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  // Honeypot: bots fill hidden fields; humans don't. Pretend success, drop it.
  if (typeof body.hp === "string" && body.hp.trim() !== "") {
    return NextResponse.json({ ok: true, saved: false, emailed: false });
  }
  // Captcha (Turnstile) — no-op if not configured.
  if (!(await verifyCaptcha(typeof body.captchaToken === "string" ? body.captchaToken : undefined, clientIp(req)))) {
    return NextResponse.json({ error: "captcha verification failed" }, { status: 400 });
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
