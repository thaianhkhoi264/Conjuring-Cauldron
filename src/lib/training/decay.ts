/**
 * Skill decay, practice and retest rules (pure functions, no database).
 *
 * Skills stay fresh for a grace period after training or after working a shift at that
 * station; beyond that they lose a little for every demo day, never dropping below a floor.
 * Experience (shifts actually worked at a station) makes all of this gentler: experienced
 * people forget more slowly, keep a higher floor, wait longer between retests, and once
 * they are experienced and still certified they are not asked to retest at all. People who
 * work few shifts have less of that cushion and need to train more.
 */

export const DECAY_PER_DAY = 0.01;
export const DECAY_FLOOR = 0.3;
export const GRACE_DAYS = 2;
export const RETEST_AFTER_DAYS = 3;

/** Experience is counted in worked shifts at a station (a shift as a trainee shadow counts half). */
export const SHADOW_EXPERIENCE = 0.5;
/** Every this-many experience points halves the decay rate (rate = base / (1 + experience / DECAY_EASE)). */
export const DECAY_EASE = 8;
/** Experience raises the decay floor by this much per point, up to MAX_FLOOR_BONUS. */
export const FLOOR_PER_EXPERIENCE = 0.02;
export const MAX_FLOOR_BONUS = 0.4;
/** Extra days between retests per 4 points of experience. */
export const RETEST_DAYS_PER_EXPERIENCE = 0.25;
/** Experienced and still certified at a station: no retests needed. */
export const EXPERIENCED_AT = 12;

/** Working a shift is practice: certified people sharpen a little, up to a ceiling (training gets them past it). */
export const PRACTICE_GAIN = 0.01;
export const PRACTICE_CEILING = 0.9;
/** A trainee shadowing learns faster but can never certify just by shadowing. */
export const SHADOW_GAIN = 0.015;
export const SHADOW_CEILING = 0.7;

const DAY_MS = 86_400_000;

export function daysBetween(fromIso: string, toIso: string) {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/** The later of two optional timestamps (the last time a skill was trained or used). */
export function latestOf(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Days of decay earned between two staleness readings: `staleBefore` days since the skill was
 * last used before the clock moved, `staleAfter` days since afterwards. Only days past the grace
 * period count, and days already decayed in an earlier skip are not counted twice.
 */
export function decayDaysBetween(staleBefore: number, staleAfter: number) {
  return Math.max(0, staleAfter - Math.max(staleBefore, GRACE_DAYS));
}

/** Same as above when nothing was practised and time simply moved forward by `advancedDays`. */
export function decayDays(staleBefore: number, advancedDays: number) {
  return decayDaysBetween(staleBefore, staleBefore + advancedDays);
}

export function decayRate(experience = 0) {
  return DECAY_PER_DAY / (1 + Math.max(0, experience) / DECAY_EASE);
}

export function decayFloor(experience = 0) {
  return DECAY_FLOOR + Math.min(MAX_FLOOR_BONUS, Math.max(0, experience) * FLOOR_PER_EXPERIENCE);
}

export function decayedScore(score: number, daysOfDecay: number, experience = 0) {
  if (daysOfDecay <= 0) return score;
  const next = Math.max(decayFloor(experience), score - decayRate(experience) * daysOfDecay);
  // Never raise a score that is already below the floor.
  return Math.round(Math.min(score, next) * 10_000) / 10_000;
}

/** Score after working shifts at a station: anchors sharpen certified skills, shadows build toward certification. */
export function practisedScore(score: number, anchorShifts: number, shadowShifts: number) {
  let next = score;
  if (anchorShifts > 0 && next < PRACTICE_CEILING) next = Math.min(PRACTICE_CEILING, next + PRACTICE_GAIN * anchorShifts);
  if (shadowShifts > 0 && next < SHADOW_CEILING) next = Math.min(SHADOW_CEILING, next + SHADOW_GAIN * shadowShifts);
  return Math.round(Math.max(score, next) * 10_000) / 10_000;
}

export function experienceFor(anchorShifts: number, shadowShifts: number) {
  return anchorShifts + SHADOW_EXPERIENCE * shadowShifts;
}

/** Days after the last use before a retest is asked for. Experienced people wait longer; slipped skills use the base interval. */
export function retestInterval(experience = 0, score = 1, certifiedAt = 0.8) {
  if (score < certifiedAt) return RETEST_AFTER_DAYS;
  return RETEST_AFTER_DAYS + Math.floor(Math.max(0, experience) * RETEST_DAYS_PER_EXPERIENCE);
}

export function isRetestDue(
  lastUsedAt: string | null,
  nowIso: string,
  attempts: number,
  options: { experience?: number; score?: number; certifiedAt?: number } = {},
) {
  if (!lastUsedAt || attempts <= 0) return false;
  const { experience = 0, score = 0, certifiedAt = 0.8 } = options;
  if (experience >= EXPERIENCED_AT && score >= certifiedAt) return false;
  return daysBetween(lastUsedAt, nowIso) >= retestInterval(experience, score, certifiedAt);
}
