/**
 * Pickup locations + rule-aware availability + H+1/H+2 lead time (v1 multi-location).
 *
 * REPLACES the two current single-location pieces:
 *   - lib/fulfillment.ts  PICKUP_LOCATION (one fixed spot)  → many locations, each with a rule
 *   - lib/pickupDate.ts   flat MIN_PICKUP_OFFSET = 3 (H+3)  → H+1/H+2 payment-time lead + per-location day rule
 *
 * All day math is Asia/Jakarta (WIB). Keep this module the SINGLE source of the
 * rule + lead-time logic so the customer calendar, the /api/orders validator,
 * the Finpay webhook re-check, and the admin "next open" preview never diverge.
 *
 * The same-day cutoff defaults to SAME_DAY_CUTOFF but every lead-time function
 * accepts an optional `cutoff` so the admin-editable pickup_settings value can
 * override it (README §2/§4) without a second source of truth.
 */

// ─────────────────────────────────────────── types
export type PickupRule =
  | { type: "weekdays" }               // Mon–Fri
  | { type: "day"; day: number }       // specific weekday, 0=Sun … 4=Thu … 6=Sat
  | { type: "twin" }                   // date-of-month === month number (01/01, 02/02 … 12/12)
  | { type: "everyday" }               // no day filter
  | { type: "external"; shopee?: string; grab?: string }; // no calendar → marketplace links

export interface PickupLocation {
  id: string;        // stable slug, e.g. "paragon-c"
  name: string;      // "Paragon Office"
  area: string;      // "Central · lobby reception"
  active: boolean;   // false → hidden on storefront
  rule: PickupRule;
  sortOrder: number;
}

/** Denormalized location snapshot stored on an order for cheap display reads. */
export interface PickupLocationSummary {
  name: string;
  area: string;
}

export interface PickupSettings {
  sameDayCutoffWib: string; // "17:00" — paid at/before → H+1, after → H+2
  openFromWib: string;      // "09:00"
  openToWib: string;        // "17:00"
}

export interface PickupDateOption {
  date: string;      // YYYY-MM-DD (WIB)
  weekday: string;   // "MON" etc
  day: number;       // day-of-month
  inMonth: boolean;  // false = leading/trailing pad cell in a month grid
  tooSoon: boolean;  // before the lead-time floor
  offRule: boolean;  // fails the location rule
  disabled: boolean; // tooSoon || offRule || !inMonth
}

// ─────────────────────────────────────────── constants
export const OPENING_FROM = "09:00";
export const SAME_DAY_CUTOFF = "17:00"; // paid at/before → H+1; after → H+2 (WIB)
export const PICKUP_TZ = "Asia/Jakarta";
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const DEFAULT_PICKUP_SETTINGS: PickupSettings = {
  sameDayCutoffWib: SAME_DAY_CUTOFF,
  openFromWib: OPENING_FROM,
  openToWib: "17:00",
};

// ─────────────────────────────────────────── WIB helpers
/** Wall-clock parts (y,m,d,hh,mm, dow 0=Sun) of `now` in Asia/Jakarta. */
function wibParts(now: Date): { y: number; m: number; d: number; hhmm: string; dow: number } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: PICKUP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    hhmm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`,
    dow: dowMap[p.weekday as string],
  };
}

/** YYYY-MM-DD for a y/m/d triple (m is 1-based). */
function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Weekday (0=Sun) and month/day for a YYYY-MM-DD key, TZ-stable via UTC-noon. */
function partsOfKey(key: string): { dow: number; day: number; month: number } {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return { dow: dt.getUTCDay(), day: d, month: m };
}

/** Add days to a YYYY-MM-DD key (calendar arithmetic, TZ-stable). */
function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// ─────────────────────────────────────────── rules + lead time
/** Does the location rule allow this calendar day? */
export function ruleAllows(rule: PickupRule, key: string): boolean {
  const { dow, day, month } = partsOfKey(key);
  switch (rule.type) {
    case "weekdays": return dow >= 1 && dow <= 5;
    case "day":      return dow === rule.day;
    case "twin":     return day === month;
    case "everyday": return true;
    default:         return false; // external → never a calendar day
  }
}

/**
 * Earliest selectable pickup date (YYYY-MM-DD, WIB), lead time only — the day
 * rule is applied on top by getPickupWindow/isValidPickupDate.
 *   paid at/before cutoff WIB → H+1 ; paid after cutoff WIB → H+2
 * NOTE: payment is async (Finpay webhook), so at checkout `now` is a provisional
 * basis; the DEFINITIVE floor is recomputed from the PAID event time in the
 * webhook (see README §6). Pre-09:00 is treated as within-cutoff (H+1).
 */
export function leadFloor(now: Date = new Date(), cutoff: string = SAME_DAY_CUTOFF): string {
  const { y, m, d, hhmm } = wibParts(now);
  const leadDays = hhmm <= cutoff ? 1 : 2;
  return addDaysKey(keyOf(y, m, d), leadDays);
}

/** First N selectable dates for a rule from the lead floor (admin "next open" preview + tests). */
export function nextPickupDates(rule: PickupRule, count: number, now: Date = new Date(), cutoff: string = SAME_DAY_CUTOFF): string[] {
  if (rule.type === "external") return [];
  const out: string[] = [];
  let key = leadFloor(now, cutoff);
  for (let i = 0; i < 420 && out.length < count; i++) {
    if (ruleAllows(rule, key)) out.push(key);
    key = addDaysKey(key, 1);
  }
  return out;
}

/**
 * Month grid (Mon-start, 6 rows × 7 = 42 cells) for the calendar UI, marking each
 * day tooSoon / offRule / disabled. `monthKey` = "YYYY-MM"; defaults to the month
 * of the lead floor so the picker opens on a month that has selectable days.
 */
export function getPickupWindow(rule: PickupRule, now: Date = new Date(), monthKey?: string, cutoff: string = SAME_DAY_CUTOFF): PickupDateOption[] {
  const floor = leadFloor(now, cutoff);
  const [fy, fm] = (monthKey ?? floor.slice(0, 7)).split("-").map(Number);
  const first = keyOf(fy, fm, 1);
  const lead = (partsOfKey(first).dow + 6) % 7; // Mon-start pad
  const cells: PickupDateOption[] = [];
  for (let i = 0; i < 42; i++) {
    const key = addDaysKey(first, i - lead);
    const { day, month } = partsOfKey(key);
    const inMonth = month === fm;
    const tooSoon = key < floor;
    const offRule = rule.type !== "external" && !ruleAllows(rule, key);
    cells.push({
      date: key, weekday: WEEKDAYS[partsOfKey(key).dow], day, inMonth,
      tooSoon, offRule, disabled: !inMonth || tooSoon || offRule,
    });
  }
  return cells;
}

/** Server-side guard: is `date` a legal pickup day for this location right now? */
export function isValidPickupDate(rule: PickupRule, date: string, now: Date = new Date(), cutoff: string = SAME_DAY_CUTOFF): boolean {
  if (rule.type === "external") return false;
  return date >= leadFloor(now, cutoff) && ruleAllows(rule, date);
}

export function formatPickupDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

/** Human label for a rule (customer pill + admin summary). */
export function ruleLabel(rule: PickupRule): string {
  switch (rule.type) {
    case "weekdays": return "Weekdays · Mon–Fri";
    case "day":      return `Every ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][rule.day]}`;
    case "twin":     return "Twin dates · 01/01, 02/02…";
    case "everyday": return "Every day";
    default:         return "Order via Shopee / GrabFood";
  }
}

/** "YYYY-MM" of the lead floor — the month the picker should open on. */
export function defaultPickupMonth(now: Date = new Date(), cutoff: string = SAME_DAY_CUTOFF): string {
  return leadFloor(now, cutoff).slice(0, 7);
}

/** Shift a "YYYY-MM" key by ±1 month (calendar-safe). */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
