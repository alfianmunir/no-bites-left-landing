/**
 * Fulfillment mode + pickup location config (E2E PRD §1a, §2).
 *
 * v1 ships PICKUP only. Delivery (address step, courier rates, delivery fee,
 * OUT_FOR_DELIVERY → DELIVERED) is preserved dormant behind this flag — flip to
 * "DELIVERY" to reintroduce it in v2. Everything reads this constant so the two
 * modes never diverge silently.
 */
import type { Fulfillment } from "./orders";

export const FULFILLMENT: Fulfillment = "PICKUP";

export const isPickup = FULFILLMENT === "PICKUP";

/**
 * Pickup locations are no longer a single fixed const — they live in the
 * admin-managed `pickup_locations` catalog (lib/pickupLocationStore.ts) and are
 * resolved per order (multi-location v1, README §3). Each order carries a
 * denormalized {name, area} snapshot (orders.pickup_location) for display.
 */

/** Click-to-chat support number (README §8) — no API, plain wa.me deep link. */
export const SUPPORT_WHATSAPP = "6281776376636";
