/**
 * Courier rate lookup — STUBBED. No real courier/rate-aggregator (Biteship-
 * class) account exists yet; this returns the static options from the design
 * so the full shipping flow (loading/list/out-of-coverage/no-couriers/failed)
 * is demoable end to end. Swap `lookupCourierRates` for a real API call
 * later — `CourierOption`/`getCourierOption` are what the rest of the app
 * depends on, so keep that shape stable.
 *
 * No secrets here, so this is safe to import from both client and server code
 * (server code re-validates the fee via getCourierOption — never trusts a
 * client-supplied fee, same principle as lib/prices.ts for item prices).
 */
export interface CourierOption {
  code: string;
  name: string;
  etaLabel: string;
  fee: number; // integer IDR
}

export const COURIER_OPTIONS: readonly CourierOption[] = [
  { code: "gosend_instant", name: "GoSend Instant", etaLabel: "Arrives in ~45 min", fee: 15000 },
  { code: "grab_express", name: "GrabExpress", etaLabel: "Arrives in ~50 min", fee: 17000 },
  { code: "same_day_economy", name: "Same-day Economy", etaLabel: "Arrives by 8 PM", fee: 9000 },
];

export function getCourierOption(code: string): CourierOption | undefined {
  return COURIER_OPTIONS.find((c) => c.code === code);
}

export type RateLookupResult =
  | { status: "ok"; options: CourierOption[] }
  | { status: "out_of_coverage" }
  | { status: "no_couriers" }
  | { status: "failed" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Demo-only heuristics so every design state is reachable without a real API:
 * typing "bandung" → out of coverage, "no couriers" → empty result,
 * "fail"/"error" → lookup failure. Anything else (including real Jakarta
 * areas) succeeds with all 3 options.
 */
export async function lookupCourierRates(area: string): Promise<RateLookupResult> {
  await sleep(900);
  const a = area.trim().toLowerCase();
  if (a.includes("fail") || a.includes("error")) return { status: "failed" };
  if (a.includes("no couriers")) return { status: "no_couriers" };
  if (a.includes("bandung")) return { status: "out_of_coverage" };
  return { status: "ok", options: [...COURIER_OPTIONS] };
}
