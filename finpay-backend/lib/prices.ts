/**
 * Server-side price list — the ONLY source of truth for order amounts.
 * PRD rule §13.1: "Server recomputes amount from a server-side price list;
 * reject client-supplied totals."
 *
 * Seeded from "No Bites Left — Cafe Pricing.xlsx" → sheet "Pricing Summary" →
 * column "Suggested Retail at Cafe (Wholesale × 2.2)", per Munir's decision
 * (3 Jul 2026) to use the retail column as authoritative.
 *
 * ⚠️ Gap carried from that decision: the pricing sheet only covers the four
 * cookie variants in two sizes (8 SKUs). Apple Pie and Fudgy Brownies Bites
 * appear on the consumer landing-page menu but are NOT priced in the sheet, so
 * they are intentionally NOT orderable via checkout until Munir supplies prices.
 * Do not invent prices for them. See PHASE0_FINDINGS.md / PHASE1_NOTES.md.
 *
 * All amounts are integer IDR.
 */

export interface PriceItem {
  sku: string;
  name: string; // customer-facing label
  variant: string; // size label
  unitPrice: number; // integer IDR
}

export const PRICE_LIST: Readonly<Record<string, PriceItem>> = Object.freeze({
  "og-40": { sku: "og-40", name: "OG Cookies", variant: "Personal 40g", unitPrice: 20000 },
  "og-100": { sku: "og-100", name: "OG Cookies", variant: "Full Max 100g", unitPrice: 48000 },
  "hazel-40": { sku: "hazel-40", name: "Hazel Lover", variant: "Personal 40g", unitPrice: 22000 },
  "hazel-100": { sku: "hazel-100", name: "Hazel Lover", variant: "Full Max 100g", unitPrice: 53000 },
  "choco-40": { sku: "choco-40", name: "Choco Mania", variant: "Personal 40g", unitPrice: 22000 },
  "choco-100": { sku: "choco-100", name: "Choco Mania", variant: "Full Max 100g", unitPrice: 53000 },
  "matcha-40": { sku: "matcha-40", name: "Matcha", variant: "Personal 40g", unitPrice: 25000 },
  "matcha-100": { sku: "matcha-100", name: "Matcha", variant: "Full Max 100g", unitPrice: 59000 },
});

export function getPriceItem(sku: string): PriceItem | undefined {
  return PRICE_LIST[sku];
}

export function listPriceItems(): PriceItem[] {
  return Object.values(PRICE_LIST);
}
