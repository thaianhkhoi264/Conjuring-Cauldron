import type { ShiftSlot } from "@/lib/db/types";

/**
 * Soft scheduling preferences (pure functions). Preferences only nudge who is picked among people who
 * already satisfy every hard rule; they never make an illegal schedule legal or leave a slot empty.
 */

export type DayPreference = "any" | "weekends" | "weekdays";

export type EnginePreference = {
  liked: ShiftSlot[];
  avoided: ShiftSlot[];
  days: DayPreference;
};

export const SLOT_WORD: Record<ShiftSlot, string> = { open: "opening", mid: "midday", close: "closing" };
export const SLOTS: ShiftSlot[] = ["open", "mid", "close"];

export const NO_PREFERENCE: EnginePreference = { liked: [], avoided: [], days: "any" };

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** How well a shift matches the preference: +1 liked slot, -1 avoided slot, +-0.5 for the preferred days. Range -1.5 to 1.5. */
export function preferenceFit(preference: EnginePreference | undefined, shift: { date: string; slot: ShiftSlot }) {
  if (!preference) return 0;
  let fit = 0;
  if (preference.liked.includes(shift.slot)) fit += 1;
  if (preference.avoided.includes(shift.slot)) fit -= 1;
  if (preference.days === "weekends") fit += isWeekend(shift.date) ? 0.5 : -0.5;
  if (preference.days === "weekdays") fit += isWeekend(shift.date) ? -0.5 : 0.5;
  return fit;
}

export function hasPreference(preference: EnginePreference | undefined) {
  return !!preference && (preference.liked.length > 0 || preference.avoided.length > 0 || preference.days !== "any");
}

/** "Prefers closing shifts and weekends; would rather avoid opening shifts." */
export function describePreference(preference: EnginePreference | undefined) {
  if (!hasPreference(preference)) return "No preferences";
  const p = preference!;
  const likes = [...p.liked.map((s) => `${SLOT_WORD[s]} shifts`), ...(p.days === "any" ? [] : [p.days])];
  const parts: string[] = [];
  if (likes.length) parts.push(`Prefers ${likes.join(" and ")}`);
  if (p.avoided.length) {
    const avoid = p.avoided.map((s) => `${SLOT_WORD[s]} shifts`).join(" and ");
    parts.push(likes.length ? `would rather avoid ${avoid}` : `Would rather avoid ${avoid}`);
  }
  return parts.join("; ");
}

/** Short reason used in schedule notes (or null when the shift is neutral for this person). */
export function fitReason(preference: EnginePreference | undefined, shift: { date: string; slot: ShiftSlot }) {
  const fit = preferenceFit(preference, shift);
  if (fit >= 0.5) return "Matches their shift preferences.";
  if (fit <= -0.5) return "Against their shift preferences (needed for coverage).";
  return null;
}

/** Validate untrusted preference input. Returns a clean preference or an error message. */
export function parsePreference(input: {
  liked?: unknown;
  avoided?: unknown;
  days?: unknown;
}): { ok: true; value: EnginePreference } | { ok: false; error: string } {
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const liked = list(input.liked);
  const avoided = list(input.avoided);
  const valid = (items: unknown[]) => items.every((slot) => SLOTS.includes(slot as ShiftSlot));
  if (!valid(liked) || !valid(avoided)) return { ok: false, error: "Shifts must be opening, midday or closing." };
  const likedSet = [...new Set(liked as ShiftSlot[])];
  const avoidedSet = [...new Set(avoided as ShiftSlot[])];
  if (likedSet.some((slot) => avoidedSet.includes(slot))) return { ok: false, error: "A shift cannot be both preferred and avoided." };
  if (likedSet.length === SLOTS.length || avoidedSet.length === SLOTS.length) {
    return { ok: false, error: "Choosing every shift is the same as no preference." };
  }
  const days = input.days ?? "any";
  if (days !== "any" && days !== "weekends" && days !== "weekdays") return { ok: false, error: "Days must be any, weekends or weekdays." };
  return { ok: true, value: { liked: likedSet, avoided: avoidedSet, days } };
}
