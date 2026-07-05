/**
 * Pickup-date logic for the 3-day pre-order model (E2E PRD §4, README §3).
 *
 * Every batch is baked to order, so the earliest selectable pickup date is H+3.
 * The picker shows a 4-column grid (8 cells) starting from "today"; the first 3
 * (H+0..H+2) render disabled ("too soon"). DAILY_CAP is the per-item/day limit
 * — no real bake-capacity backend exists yet (PRD §12 Q1), so `isCapacityClosed`
 * is a stub; FULL_OFFSETS lets us mark specific near dates full for demos.
 */
export interface PickupDateOption {
  date: string; // YYYY-MM-DD
  weekday: string; // "MON" etc
  day: number;
  tooSoon: boolean; // H+0..H+2 — not selectable
  full: boolean; // capacity reached — not selectable
  disabled: boolean; // tooSoon || full
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const MIN_PICKUP_OFFSET = 3; // H+3 earliest
export const DAILY_CAP = 30; // max pcs / item / day (PRD §12 Q1 open)
export const PICKUP_WINDOW_CELLS = 8; // 4-col grid, 8 cells (README §3)

/** Day offsets that are fully booked. Demo default; wire to real capacity later. */
export const FULL_OFFSETS: readonly number[] = [];

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** H, H+1, H+2 shown disabled; H+3 is the earliest selectable date. */
export function getEarliestPickupDate(now: Date = new Date()): string {
  return toDateKey(new Date(now.getTime() + MIN_PICKUP_OFFSET * DAY_MS));
}

export function getPickupWindow(now: Date = new Date(), cells: number = PICKUP_WINDOW_CELLS): PickupDateOption[] {
  const options: PickupDateOption[] = [];
  for (let i = 0; i < cells; i++) {
    const d = new Date(now.getTime() + i * DAY_MS);
    const tooSoon = i < MIN_PICKUP_OFFSET;
    const full = !tooSoon && (FULL_OFFSETS.includes(i) || isCapacityClosed(toDateKey(d)));
    options.push({
      date: toDateKey(d),
      weekday: WEEKDAYS[d.getDay()],
      day: d.getDate(),
      tooSoon,
      full,
      disabled: tooSoon || full,
    });
  }
  return options;
}

/** Stub — no real bake-capacity system yet (PRD §12 Q1). Always open for now. */
export function isCapacityClosed(_date: string): boolean {
  return false;
}

export function isValidPickupDate(date: string, now: Date = new Date()): boolean {
  return date >= getEarliestPickupDate(now) && !isCapacityClosed(date);
}

export function formatPickupDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}
