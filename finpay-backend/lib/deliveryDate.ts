/**
 * 3-day pre-order delivery-date logic. Every batch is baked to order, so the
 * earliest selectable date is H+3; the picker shows an 8-day window from
 * there. No real bake-capacity backend exists yet (PRD §9 open question) —
 * `isCapacityClosed` is a stand-in that always returns false; wire it to a
 * real capacity check later.
 */
export interface DateOption {
  date: string; // YYYY-MM-DD
  weekday: string; // "MON" etc
  day: number;
  disabled: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** H, H+1, H+2 shown disabled; H+3 is the earliest selectable date. */
export function getEarliestDeliveryDate(now: Date = new Date()): string {
  return toDateKey(new Date(now.getTime() + 3 * DAY_MS));
}

export function getDateWindow(now: Date = new Date(), windowDays: number = 8): DateOption[] {
  const options: DateOption[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now.getTime() + i * DAY_MS);
    options.push({
      date: toDateKey(d),
      weekday: WEEKDAYS[d.getDay()],
      day: d.getDate(),
      disabled: i < 3,
    });
  }
  return options;
}

/** Stub — no real bake-capacity system yet. Always open for now. */
export function isCapacityClosed(_date: string): boolean {
  return false;
}

export function isValidDeliveryDate(date: string, now: Date = new Date()): boolean {
  return date >= getEarliestDeliveryDate(now) && !isCapacityClosed(date);
}

export function formatDeliveryDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}
