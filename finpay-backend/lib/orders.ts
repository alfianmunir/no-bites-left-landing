/**
 * Order domain types + helpers shared across API routes, DB, and admin.
 */

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export const FINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "FULFILLED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
]);

/** Statuses from which a webhook/reconciliation may still transition the order. */
export function isFinal(status: OrderStatus): boolean {
  return FINAL_STATUSES.has(status);
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

/** Post-payment production tracking — distinct from the payment `status` above. */
export type FulfillmentStage = "baking" | "out_for_delivery" | "delivered";

export const FULFILLMENT_STAGE_ORDER: readonly FulfillmentStage[] = ["baking", "out_for_delivery", "delivered"];

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
  finpay_reference: string | null;
  redirect_url: string | null;
  expiry_link: string | null; // ISO timestamp
  callback_log: unknown[];
  delivery_address: DeliveryAddress | null;
  delivery_date: string | null; // YYYY-MM-DD
  courier: CourierChoice | null;
  fulfillment_stage: FulfillmentStage | null;
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
