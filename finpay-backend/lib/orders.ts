/**
 * Order domain types + helpers shared across API routes, DB, and admin.
 */

/**
 * Canonical order lifecycle — single-axis state machine (E2E PRD §3).
 *
 * v1 = PICKUP: PENDING → PAID → BAKING → READY_FOR_PICKUP → PICKED_UP
 * v2 = DELIVERY (dormant, gated by `fulfillment`): BAKING → OUT_FOR_DELIVERY → DELIVERED
 *
 * `PICKED_UP` is the canonical terminal completed state; `FULFILLED` (old
 * Finpay PRD) and `DELIVERED` (v2) map to the same "done" concept.
 */
export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "BAKING"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED"
  // v2 delivery — only reachable when fulfillment === "DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

export const FINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "PICKED_UP",
  "DELIVERED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
]);

/** Statuses from which a webhook/reconciliation may still transition the order. */
export function isFinal(status: OrderStatus): boolean {
  return FINAL_STATUSES.has(status);
}

/** v1 = PICKUP only; DELIVERY preserved dormant for v2 (E2E PRD §1a). */
export type Fulfillment = "PICKUP" | "DELIVERY";

/**
 * The admin-driven production progression, per fulfillment mode. Each step is a
 * single "advance" tap (E2E PRD §5.3 / §7). PICKED_UP and DELIVERED are terminal.
 */
const PICKUP_PROGRESSION: readonly OrderStatus[] = ["PAID", "BAKING", "READY_FOR_PICKUP", "PICKED_UP"];
const DELIVERY_PROGRESSION: readonly OrderStatus[] = ["PAID", "BAKING", "OUT_FOR_DELIVERY", "DELIVERED"];

export function progressionFor(fulfillment: Fulfillment): readonly OrderStatus[] {
  return fulfillment === "DELIVERY" ? DELIVERY_PROGRESSION : PICKUP_PROGRESSION;
}

/**
 * Next status an admin can advance to, or null if already at the end of the
 * production chain (or not on it — e.g. still PENDING/EXPIRED). Sequential only.
 */
export function nextFulfillmentStatus(status: OrderStatus, fulfillment: Fulfillment): OrderStatus | null {
  const chain = progressionFor(fulfillment);
  const i = chain.indexOf(status);
  if (i === -1 || i === chain.length - 1) return null;
  return chain[i + 1];
}

/**
 * Whether `to` is a legal transition from `from`. Guards the state machine
 * server-side (E2E PRD §7 — illegal transitions like PICKED_UP → PENDING or
 * PAID → EXPIRED are rejected). Webhook (→ PAID), reconciliation (→ EXPIRED),
 * and cancel/refund transitions are allowed alongside the admin progression.
 */
export function canTransition(from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment): boolean {
  if (from === to) return false;
  if (isFinal(from)) return false; // final states never move
  switch (to) {
    case "PAID":
      return from === "PENDING";
    case "EXPIRED":
      return from === "PENDING";
    case "CANCELLED":
      return from === "PENDING"; // only while unpaid
    case "REFUNDED":
      // any paid-but-not-yet-completed state can be refunded
      return progressionFor(fulfillment).includes(from) && from !== progressionFor(fulfillment).at(-1);
    default:
      // production progression: must be the immediate next step
      return nextFulfillmentStatus(from, fulfillment) === to;
  }
}

/** One entry in an order's audit trail (E2E PRD §6 — status_history). */
export type StatusActor = "system" | "webhook" | "admin" | "customer" | "reconciliation";
export interface StatusEvent {
  status: OrderStatus;
  at: string; // ISO timestamp
  by: StatusActor;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unit_price: number; // integer IDR
}

export interface Customer {
  email: string;
  firstName: string;
  lastName: string;
  mobilePhone: string;
}

/** v2 delivery details — captured only when fulfillment === "DELIVERY" (dormant in v1). */
export interface DeliveryAddress {
  recipientName: string;
  phone: string;
  area: string;
  fullAddress: string;
  notes?: string;
}

export interface CourierChoice {
  code: string;
  name: string;
  fee: number; // integer IDR
  etaLabel: string;
}

export interface Order {
  id: string;
  items: OrderItem[];
  amount: number; // integer IDR (items + courier fee)
  customer: Customer;
  status: OrderStatus;
  fulfillment: Fulfillment; // v1 = "PICKUP"
  pickup_date: string | null; // YYYY-MM-DD, >= order day + 3 (v1)
  finpay_reference: string | null;
  redirect_url: string | null;
  expiry_link: string | null; // ISO timestamp
  callback_log: unknown[];
  status_history: StatusEvent[]; // audit + timeline (E2E PRD §6)
  // v2 delivery (dormant in v1 — null for PICKUP orders):
  delivery_address: DeliveryAddress | null;
  delivery_date: string | null; // YYYY-MM-DD
  courier: CourierChoice | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Generate an order id: NBL-<ts>-<rand>, alpha-dash, <= 30 chars.
 * Finpay order.id is "Alpha Dash", 1-30 chars (docs/object/order).
 * ts is base36 seconds; rand is 4 uppercase alnum → well under 30 chars.
 */
export function generateOrderId(now: number = Date.now()): string {
  const ts = Math.floor(now / 1000).toString(36).toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  const id = `NBL-${ts}-${rand}`;
  // Safety: Finpay id must be alpha-dash and <=30. Our format is ~15 chars.
  return id.slice(0, 30);
}

const ALPHA_DASH = /^[A-Za-z0-9-]{1,30}$/;
export function isValidOrderId(id: string): boolean {
  return ALPHA_DASH.test(id);
}
