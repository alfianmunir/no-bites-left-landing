/**
 * Order notifications (E2E PRD §8) via Resend transactional email.
 *   - notifyOpsPaid: ops gets an email when an order is PAID.
 *   - notifyCustomerReady: customer gets "ready to collect" when an order is
 *     marked READY_FOR_PICKUP (admin advance).
 *
 * If RESEND_API_KEY is unset (or the sender domain isn't verified yet), we log
 * a structured line and no-op instead of throwing — the order flow must never
 * fail because an email couldn't be sent. WhatsApp is a later channel (PRD §8).
 */
import { Resend } from "resend";
import { env } from "./env";
import { logOrder } from "./log";
import { formatPickupDate } from "./pickup";
import type { Order } from "./orders";

/** Display name/area for an order's pickup location (denormalized snapshot, with
 *  a fallback for any legacy order created before the multi-location era). */
function pickupPlace(order: Order): { name: string; area: string } {
  return order.pickup_location ?? { name: "No Bites Left · Pickup", area: "" };
}

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function itemsList(order: Order): string {
  return order.items.map((i) => `${i.qty}× ${i.name}`).join(", ");
}

async function send(to: string, subject: string, html: string, tag: string, meta: Record<string, unknown>): Promise<void> {
  if (!resend || !to) {
    logOrder(tag, { ...meta, sent: false, reason: resend ? "no recipient" : "RESEND_API_KEY unset" });
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: env.mailFrom,
      to,
      subject,
      html,
      ...(env.mailReplyTo ? { replyTo: env.mailReplyTo } : {}),
    });
    if (error) {
      logOrder(`${tag}_error`, { ...meta, error: String(error) });
      return;
    }
    logOrder(tag, { ...meta, sent: true });
  } catch (e) {
    // Never let a notification failure break the order flow.
    logOrder(`${tag}_error`, { ...meta, error: String(e) });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Like `send`, but returns whether it sent (for form endpoints that report back). */
async function sendResult(to: string, subject: string, html: string, tag: string, meta: Record<string, unknown>): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY unset" };
  try {
    const { error } = await resend.emails.send({
      from: env.mailFrom,
      to,
      subject,
      html,
      ...(env.mailReplyTo ? { replyTo: env.mailReplyTo } : {}),
    });
    if (error) {
      logOrder(`${tag}_error`, { ...meta, error: String(error) });
      return { sent: false, reason: String(error) };
    }
    logOrder(tag, { ...meta, sent: true });
    return { sent: true };
  } catch (e) {
    logOrder(`${tag}_error`, { ...meta, error: String(e) });
    return { sent: false, reason: String(e) };
  }
}

export async function notifyOpsPaid(order: Order): Promise<void> {
  const pickup = order.pickup_date ? formatPickupDate(order.pickup_date) : "—";
  const place = pickupPlace(order);
  const html = `
    <h2>New paid order ${order.id}</h2>
    <p><b>Pickup:</b> ${pickup} · ${escapeHtml(place.name)}${place.area ? ` · ${escapeHtml(place.area)}` : ""}</p>
    <p><b>Total:</b> ${rupiah(order.amount)}</p>
    <p><b>Items:</b> ${itemsList(order)}</p>
    <p><b>Customer:</b> ${order.customer.firstName} ${order.customer.lastName} · ${order.customer.mobilePhone} · ${order.customer.email}</p>
  `;
  await send(env.opsNotifyEmail, `🍪 New paid order ${order.id}`, html, "ops_notify_paid", {
    orderId: order.id,
    amount: order.amount,
    to: env.opsNotifyEmail,
  });
}

export interface FeedbackInput { rating: number; name: string; flavour?: string; message?: string }
export async function notifyFeedback(fb: FeedbackInput): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY unset" };
  const to = env.opsNotifyEmail;
  if (!to) return { sent: false, reason: "OPS_NOTIFY_EMAIL unset" };
  const html = `
    <h2>New feedback ${"★".repeat(Math.max(0, Math.min(5, fb.rating)))}${"☆".repeat(5 - Math.max(0, Math.min(5, fb.rating)))}</h2>
    <p><b>From:</b> ${escapeHtml(fb.name)}</p>
    <p><b>Rating:</b> ${fb.rating} / 5</p>
    ${fb.flavour ? `<p><b>Flavour:</b> ${escapeHtml(fb.flavour)}</p>` : ""}
    ${fb.message ? `<p><b>Message:</b><br/>${escapeHtml(fb.message).replace(/\n/g, "<br/>")}</p>` : ""}
  `;
  return sendResult(to, `⭐ Feedback from ${fb.name} (${fb.rating}★)`, html, "feedback_notify", { name: fb.name, rating: fb.rating });
}

export interface WholesaleInput { name: string; role: string; cafe: string; city: string; contact: string; volume?: string }
export async function notifyWholesale(w: WholesaleInput): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY unset" };
  const to = env.opsNotifyEmail;
  if (!to) return { sent: false, reason: "OPS_NOTIFY_EMAIL unset" };
  const html = `
    <h2>New wholesale / tasting request 🧑‍🍳</h2>
    <p><b>Cafe:</b> ${escapeHtml(w.cafe)}</p>
    <p><b>Contact:</b> ${escapeHtml(w.name)} (${escapeHtml(w.role)}) · ${escapeHtml(w.contact)}</p>
    <p><b>City / area:</b> ${escapeHtml(w.city)}</p>
    <p><b>Expected weekly volume:</b> ${w.volume ? escapeHtml(w.volume) : "—"}</p>
  `;
  return sendResult(to, `🧑‍🍳 Wholesale tasting request — ${w.cafe}`, html, "wholesale_notify", { cafe: w.cafe, contact: w.contact });
}

/**
 * Mirror an activity-feed message to the ops team's EMAIL (called when the email
 * notify channel is enabled). Best-effort: logs + no-ops if Resend/recipient
 * unset, and never throws — activity logging must never break a mutation.
 */
export async function sendActivityEmail(message: string): Promise<{ sent: boolean; reason?: string }> {
  if (!env.opsNotifyEmail) return { sent: false, reason: "OPS_NOTIFY_EMAIL unset" };
  const html = `<p style="font-size:15px;color:#281a0b">${escapeHtml(message)}</p><p style="color:#6f5c45;font-size:12px">No Bites Left · ops activity</p>`;
  return sendResult(env.opsNotifyEmail, `🔔 ${message.slice(0, 80)}`, html, "activity_notify_email", { message });
}

/**
 * WhatsApp mirror — STUB. No provider is wired yet (PRD §8), so this logs the
 * intent and no-ops. Enabling the whatsapp channel is therefore safe: nothing is
 * sent until a real provider lands here.
 */
export async function sendActivityWhatsapp(message: string): Promise<{ sent: boolean; reason?: string }> {
  logOrder("activity_notify_whatsapp_stub", { message, sent: false, reason: "no_provider" });
  return { sent: false, reason: "no_provider" };
}

/**
 * Tell the customer their order was cancelled + a manual refund is coming (the
 * refund itself is processed outside the app — we collect bank details over
 * WhatsApp). Includes the admin-entered cancellation reason. Best-effort email.
 */
export async function notifyCustomerCancelled(order: Order, reason: string): Promise<void> {
  const name = order.customer.firstName || "there";
  const html = `
    <h2>Your order was cancelled</h2>
    <p>Hi ${escapeHtml(name)},</p>
    <p>We are deeply sorry, but we have to cancel your order <b>${order.id}</b> on nobitesleft.com due to <b>${escapeHtml(reason)}</b>.</p>
    <p>A full refund of <b>${rupiah(order.amount)}</b> will be processed. We&apos;ll reach out on WhatsApp to collect your bank account number so we can send it across.</p>
    <p>Thank you for your understanding. — No Bites Left</p>
  `;
  await send(order.customer.email, `Your No Bites Left order ${order.id} was cancelled`, html, "customer_notify_cancelled", {
    orderId: order.id,
    to: order.customer.email,
  });
}

export async function notifyCustomerReady(order: Order): Promise<void> {
  const pickup = order.pickup_date ? formatPickupDate(order.pickup_date) : "your pickup date";
  const place = pickupPlace(order);
  const html = `
    <h2>Your order is ready to collect 🛍️</h2>
    <p>Order <b>${order.id}</b> is baked fresh and ready for pickup.</p>
    <p><b>Collect on:</b> ${pickup}</p>
    <p><b>${escapeHtml(place.name)}</b>${place.area ? `<br/>${escapeHtml(place.area)}` : ""}</p>
    <p>See you soon! — No Bites Left</p>
  `;
  await send(order.customer.email, `Your No Bites Left order is ready to collect 🛍️`, html, "customer_notify_ready", {
    orderId: order.id,
    to: order.customer.email,
  });
}

/**
 * Payment landed after the same-day cutoff, so the earliest valid pickup date
 * moved out (H+1 → H+2 + rule). Tell the customer their pickup date was bumped
 * (README §6 auto-bump). Best-effort email.
 */
export async function notifyCustomerPickupMoved(order: Order, newDate: string): Promise<void> {
  const name = order.customer.firstName || "there";
  const place = pickupPlace(order);
  const html = `
    <h2>Your pickup date was updated</h2>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for your payment on order <b>${order.id}</b>! Because it came through a little later in the day, the earliest we can have it freshly baked is now <b>${formatPickupDate(newDate)}</b>.</p>
    <p><b>Collect at:</b> ${escapeHtml(place.name)}${place.area ? ` · ${escapeHtml(place.area)}` : ""}</p>
    <p>If that date doesn&apos;t work, just reply or message us on WhatsApp and we&apos;ll sort it out. — No Bites Left</p>
  `;
  await send(order.customer.email, `Your No Bites Left pickup date moved to ${formatPickupDate(newDate)}`, html, "customer_notify_pickup_moved", {
    orderId: order.id,
    newDate,
    to: order.customer.email,
  });
}
