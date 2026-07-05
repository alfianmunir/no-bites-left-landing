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
import { PICKUP_LOCATION } from "./fulfillment";
import { formatPickupDate } from "./pickupDate";
import type { Order } from "./orders";

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

export async function notifyOpsPaid(order: Order): Promise<void> {
  const pickup = order.pickup_date ? formatPickupDate(order.pickup_date) : "—";
  const html = `
    <h2>New paid order ${order.id}</h2>
    <p><b>Pickup:</b> ${pickup} · ${PICKUP_LOCATION.name}</p>
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

export async function notifyCustomerReady(order: Order): Promise<void> {
  const pickup = order.pickup_date ? formatPickupDate(order.pickup_date) : "your pickup date";
  const html = `
    <h2>Your order is ready to collect 🛍️</h2>
    <p>Order <b>${order.id}</b> is baked fresh and ready for pickup.</p>
    <p><b>Collect on:</b> ${pickup}</p>
    <p><b>${PICKUP_LOCATION.name}</b><br/>${PICKUP_LOCATION.address}<br/>${PICKUP_LOCATION.hours}</p>
    <p>See you soon! — No Bites Left</p>
  `;
  await send(order.customer.email, `Your No Bites Left order is ready to collect 🛍️`, html, "customer_notify_ready", {
    orderId: order.id,
    to: order.customer.email,
  });
}
