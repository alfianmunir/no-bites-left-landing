/**
 * Ops notification on newly-paid orders. Real delivery (email/WhatsApp) is
 * Phase 4; for now this logs a structured line so the call site and the data
 * it needs already exist, and the webhook path is fully testable.
 */
import { env } from "./env";
import { logOrder } from "./log";
import type { Order } from "./orders";

export async function notifyOpsPaid(order: Order): Promise<void> {
  logOrder("ops_notify_paid", {
    orderId: order.id,
    amount: order.amount,
    customerEmail: order.customer.email,
    itemCount: order.items.length,
    notifyTarget: env.opsNotifyEmail || "(unset — configure OPS_NOTIFY_EMAIL)",
  });
}
