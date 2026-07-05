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
 * Single fixed collection point shown at checkout, on the confirmation, and on
 * the order-status page (E2E PRD §1a). NOTE: the design source is inconsistent
 * about the address line — the PICKUP constant says "Apartemen Kebagusan City",
 * some markup says "Jl. Kebagusan Raya No. 12". PRD §12 Q8 flags "confirm the
 * single collection address + hours" as still open — confirm before launch.
 */
export const PICKUP_LOCATION = {
  name: "No Bites Left · Kebagusan",
  address: "Apartemen Kebagusan City, Tower A · Pasar Minggu, Jakarta Selatan",
  hours: "Every day · 09.00–18.00 WIB",
} as const;

/** Click-to-chat support number (README §8) — no API, plain wa.me deep link. */
export const SUPPORT_WHATSAPP = "6281776376636";
