import type { ShiftSlot, StationRequirements } from "@/lib/db/types";
import { SLOT_TIMES } from "@/lib/slots";

/** Pure date and shift-pattern helpers. Dates are YYYY-MM-DD strings treated as UTC. */

export const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export type ShiftTemplate = { id: string; date: string; slot: ShiftSlot; requiredJson: string };

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function dayOfWeek(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
}

export function dateOf(iso: string) {
  return iso.slice(0, 10);
}

/**
 * The planning window: the 7 days after "today" (today's shifts are already under way).
 * With the demo clock on Sat 2026-10-03 that is Sun 10-04 through Sat 10-10.
 */
export function planningWindow(nowIso: string) {
  const today = dateOf(nowIso);
  return { from: addDays(today, 1), to: addDays(today, WINDOW_DAYS) };
}

export function inWindow(date: string, window: { from: string; to: string }) {
  return date >= window.from && date <= window.to;
}

/** Default staffing needs: the open shift is prep only, weekends are busier at mid. */
export function requirementsFor(date: string, slot: ShiftSlot): StationRequirements {
  const dow = dayOfWeek(date);
  const weekend = dow === 0 || dow === 6;
  if (slot === "open") return { food: 1, drink: 1, cs: 0 };
  if (slot === "mid") return weekend ? { food: 2, drink: 1, cs: 1 } : { food: 1, drink: 1, cs: 1 };
  return { food: 1, drink: 1, cs: 1 };
}

export function buildDayShifts(date: string): ShiftTemplate[] {
  return (Object.keys(SLOT_TIMES) as ShiftSlot[]).map((slot) => ({
    id: `shift-${date}-${slot}`,
    date,
    slot,
    requiredJson: JSON.stringify(requirementsFor(date, slot)),
  }));
}

/** Seven consecutive days of shifts starting at `startDate`. */
export function buildWeekShifts(startDate: string): ShiftTemplate[] {
  return Array.from({ length: 7 }, (_, i) => buildDayShifts(addDays(startDate, i))).flat();
}

/**
 * Shifts that must be created so that every date up to `through` has them,
 * continuing day by day from the latest existing shift date.
 */
export function missingShifts(existingDates: string[], through: string): ShiftTemplate[] {
  const latest = existingDates.length ? [...existingDates].sort().at(-1)! : null;
  if (!latest) return [];
  const created: ShiftTemplate[] = [];
  for (let date = addDays(latest, 1); date <= through; date = addDays(date, 1)) {
    created.push(...buildDayShifts(date));
  }
  return created;
}
