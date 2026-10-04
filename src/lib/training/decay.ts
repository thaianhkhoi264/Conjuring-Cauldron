/**
 * Skill decay and retest rules (pure functions, no database).
 *
 * Skills stay fresh for a grace period after training; beyond that they lose
 * DECAY_PER_DAY for every demo day, never dropping below DECAY_FLOOR. A station is
 * due for a retest once RETEST_AFTER_DAYS demo days have passed since its last training.
 */

export const DECAY_PER_DAY = 0.01;
export const DECAY_FLOOR = 0.3;
export const GRACE_DAYS = 2;
export const RETEST_AFTER_DAYS = 3;

const DAY_MS = 86_400_000;

export function daysBetween(fromIso: string, toIso: string) {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/**
 * Days of decay earned when time moves forward by `advancedDays`, given how many days
 * ago the station was last trained (`staleBefore`). Only days past the grace period count,
 * and days already decayed in an earlier skip are not counted twice.
 */
export function decayDays(staleBefore: number, advancedDays: number) {
  const staleAfter = staleBefore + advancedDays;
  return Math.max(0, staleAfter - Math.max(staleBefore, GRACE_DAYS));
}

export function decayedScore(score: number, daysOfDecay: number) {
  if (daysOfDecay <= 0) return score;
  const next = Math.max(DECAY_FLOOR, score - DECAY_PER_DAY * daysOfDecay);
  // Never raise a score that is already below the floor.
  return Math.round(Math.min(score, next) * 10_000) / 10_000;
}

export function isRetestDue(lastTrainedAt: string | null, nowIso: string, attempts: number) {
  if (!lastTrainedAt || attempts <= 0) return false;
  return daysBetween(lastTrainedAt, nowIso) >= RETEST_AFTER_DAYS;
}
