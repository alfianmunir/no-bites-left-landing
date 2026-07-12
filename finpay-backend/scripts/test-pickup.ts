/**
 * Unit checks for the multi-location pickup engine (lib/pickup.ts) — the single
 * source of the rule + H+1/H+2 lead-time logic that guards the customer
 * calendar, the /api/orders validator, and the Finpay webhook re-check.
 *
 * All day math is WIB (Asia/Jakarta). Fixed `now` instants are chosen so the
 * cutoff behaviour is deterministic regardless of the machine timezone.
 *
 * Usage: npm run test:pickup
 */
import {
  ruleAllows,
  leadFloor,
  isValidPickupDate,
  nextPickupDates,
  getPickupWindow,
  defaultPickupMonth,
  shiftMonth,
  type PickupRule,
} from "../lib/pickup";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${detail ? " — " + detail : ""}`);
}
function eq<T>(name: string, got: T, want: T) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
}

// WIB = UTC+7. Reference instants around 2026-07-11 (a Saturday in WIB):
const NOON_WIB = new Date("2026-07-11T05:00:00Z");     // 12:00 WIB → before cutoff → H+1
const EVENING_WIB = new Date("2026-07-11T11:00:00Z");  // 18:00 WIB → after  cutoff → H+2
const AT_CUTOFF_WIB = new Date("2026-07-11T10:00:00Z"); // 17:00 WIB exactly → H+1

console.log("=== Pickup engine unit checks ===");

// --- ruleAllows ---
console.log("\nruleAllows (2026-07-11 Sat, 12 Sun, 13 Mon, 16 Thu):");
const weekdays: PickupRule = { type: "weekdays" };
const thursday: PickupRule = { type: "day", day: 4 };
const twin: PickupRule = { type: "twin" };
const everyday: PickupRule = { type: "everyday" };
const external: PickupRule = { type: "external", shopee: "https://s" };
check("weekdays allows Mon 07-13", ruleAllows(weekdays, "2026-07-13"));
check("weekdays blocks Sun 07-12", !ruleAllows(weekdays, "2026-07-12"));
check("weekdays blocks Sat 07-11", !ruleAllows(weekdays, "2026-07-11"));
check("day=Thu allows 07-16", ruleAllows(thursday, "2026-07-16"));
check("day=Thu blocks 07-13", !ruleAllows(thursday, "2026-07-13"));
check("twin allows 07-07", ruleAllows(twin, "2026-07-07"));
check("twin blocks 07-08", !ruleAllows(twin, "2026-07-08"));
check("everyday allows any", ruleAllows(everyday, "2026-07-11"));
check("external never allows", !ruleAllows(external, "2026-07-11"));

// --- leadFloor (H+1 / H+2 around the cutoff) ---
console.log("\nleadFloor (17:00 WIB cutoff):");
eq("noon → H+1", leadFloor(NOON_WIB), "2026-07-12");
eq("evening → H+2", leadFloor(EVENING_WIB), "2026-07-13");
eq("exactly 17:00 → H+1", leadFloor(AT_CUTOFF_WIB), "2026-07-12");
eq("custom cutoff 11:00, noon(after) → H+2", leadFloor(NOON_WIB, "11:00"), "2026-07-13");

// --- isValidPickupDate ---
console.log("\nisValidPickupDate (now = noon 07-11, floor 07-12):");
check("everyday accepts 07-12", isValidPickupDate(everyday, "2026-07-12", NOON_WIB));
check("everyday rejects 07-11 (too soon)", !isValidPickupDate(everyday, "2026-07-11", NOON_WIB));
check("weekdays rejects Sun 07-12 (off-rule)", !isValidPickupDate(weekdays, "2026-07-12", NOON_WIB));
check("weekdays accepts Mon 07-13", isValidPickupDate(weekdays, "2026-07-13", NOON_WIB));
check("external always invalid", !isValidPickupDate(external, "2026-07-13", NOON_WIB));
check("evening pushes floor: rejects 07-12", !isValidPickupDate(everyday, "2026-07-12", EVENING_WIB));

// --- nextPickupDates ---
console.log("\nnextPickupDates (now = noon 07-11):");
eq("weekdays next 3", nextPickupDates(weekdays, 3, NOON_WIB), ["2026-07-13", "2026-07-14", "2026-07-15"]);
eq("day=Thu next 2", nextPickupDates(thursday, 2, NOON_WIB), ["2026-07-16", "2026-07-23"]);
eq("twin next 2", nextPickupDates(twin, 2, NOON_WIB), ["2026-08-08", "2026-09-09"]);
eq("external → []", nextPickupDates(external, 3, NOON_WIB), []);

// --- getPickupWindow month grid ---
console.log("\ngetPickupWindow (July 2026 grid):");
const grid = getPickupWindow(everyday, NOON_WIB, "2026-07");
check("42 cells", grid.length === 42, String(grid.length));
check("31 in-month cells", grid.filter((c) => c.inMonth).length === 31);
const c13 = grid.find((c) => c.date === "2026-07-13");
check("07-13 selectable", !!c13 && !c13.disabled && !c13.tooSoon && !c13.offRule);
const c11 = grid.find((c) => c.date === "2026-07-11");
check("07-11 tooSoon", !!c11 && c11.tooSoon && c11.disabled);
const wkGrid = getPickupWindow(weekdays, NOON_WIB, "2026-07");
const w12 = wkGrid.find((c) => c.date === "2026-07-12");
check("weekdays 07-12 offRule", !!w12 && w12.offRule && w12.disabled);
check("grid defaults to lead-floor month", getPickupWindow(everyday, NOON_WIB)[0] !== undefined && defaultPickupMonth(NOON_WIB) === "2026-07");

// --- month helpers ---
console.log("\nmonth helpers:");
eq("shiftMonth +1 wraps year", shiftMonth("2026-12", 1), "2027-01");
eq("shiftMonth -1 wraps year", shiftMonth("2026-01", -1), "2025-12");
eq("defaultPickupMonth(evening)", defaultPickupMonth(EVENING_WIB), "2026-07");

console.log(`\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`);
process.exit(failures === 0 ? 0 : 1);
