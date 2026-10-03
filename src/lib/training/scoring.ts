/**
 * Deterministic facts and fallback scoring for drag-and-drop recipe builds.
 * Pure functions only (no database, no LLM) so they can be tested in isolation.
 * The Gemini judge in judge.ts is grounded on these facts and bounded by them.
 */

export type BuildEvent = { type: "add" | "remove"; item: string; atMs: number };

export type BuildFacts = {
  expected: string[];
  actual: string[];
  /** Items placed in the right relative order (longest common subsequence). */
  correctInOrder: number;
  missing: string[];
  extra: string[];
  /** Items that were used but sit in the wrong place. */
  outOfOrder: string[];
  removals: number;
  elapsedSeconds: number;
  targetSeconds: number;
};

export type Scores = { accuracy: number; speed: number; score: number };

export const ACCURACY_WEIGHT = 0.75;
export const SPEED_WEIGHT = 0.25;
/** How far the LLM may move accuracy/speed away from the deterministic value. */
export const JUDGE_BAND = 0.15;

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Replay add/remove events into the final stack of items. */
export function replayEvents(events: BuildEvent[]): string[] {
  const stack: string[] = [];
  for (const event of events) {
    if (event.type === "add") {
      if (!stack.includes(event.item)) stack.push(event.item);
    } else {
      const index = stack.lastIndexOf(event.item);
      if (index >= 0) stack.splice(index, 1);
    }
  }
  return stack;
}

/** Indices of `actual` that belong to a longest common subsequence with `expected`. */
function lcsMatchedActualIndices(expected: string[], actual: string[]) {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const table = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      table[i][j] =
        expected[i - 1] === actual[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const matched = new Set<number>();
  let i = expected.length;
  let j = actual.length;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === actual[j - 1]) {
      matched.add(j - 1);
      i--;
      j--;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return matched;
}

export function computeFacts(
  expected: string[],
  events: BuildEvent[],
  elapsedMs: number,
  targetSeconds: number,
): BuildFacts {
  const actual = replayEvents(events);
  const matched = lcsMatchedActualIndices(expected, actual);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  return {
    expected,
    actual,
    correctInOrder: matched.size,
    missing: expected.filter((item) => !actualSet.has(item)),
    extra: actual.filter((item) => !expectedSet.has(item)),
    outOfOrder: actual.filter((item, index) => expectedSet.has(item) && !matched.has(index)),
    removals: events.filter((event) => event.type === "remove").length,
    elapsedSeconds: Math.round((elapsedMs / 1000) * 10) / 10,
    targetSeconds,
  };
}

/** 1 within the target time, falling linearly to 0 at three times the target. */
export function speedScore(elapsedSeconds: number, targetSeconds: number) {
  if (targetSeconds <= 0 || elapsedSeconds <= targetSeconds) return 1;
  return clamp01(1 - (elapsedSeconds - targetSeconds) / (2 * targetSeconds));
}

/** Speed only helps when the build is accurate: a fast wrong dish scores 0. */
export function combineScores(accuracy: number, speed: number) {
  const a = clamp01(accuracy);
  return clamp01(a * (ACCURACY_WEIGHT + SPEED_WEIGHT * clamp01(speed)));
}

export function deterministicScores(facts: BuildFacts): Scores {
  const denominator = Math.max(facts.expected.length, facts.actual.length, 1);
  const accuracy = facts.actual.length === 0 ? 0 : facts.correctInOrder / denominator;
  const speed = facts.actual.length === 0 ? 0 : speedScore(facts.elapsedSeconds, facts.targetSeconds);
  return { accuracy: round2(accuracy), speed: round2(speed), score: round2(combineScores(accuracy, speed)) };
}

/** Keep an LLM-proposed value within `band` of the deterministic value. */
export function clampToBand(value: number, center: number, band = JUDGE_BAND) {
  if (!Number.isFinite(value)) return clamp01(center);
  return clamp01(Math.min(center + band, Math.max(center - band, value)));
}

export function fallbackMistakes(facts: BuildFacts): string[] {
  const mistakes: string[] = [];
  if (facts.missing.length) mistakes.push(`Forgot: ${facts.missing.join(", ")}.`);
  if (facts.extra.length) mistakes.push(`Added items that do not belong: ${facts.extra.join(", ")}.`);
  if (facts.outOfOrder.length) mistakes.push(`Wrong order for: ${facts.outOfOrder.join(", ")}.`);
  if (facts.elapsedSeconds > facts.targetSeconds) {
    mistakes.push(`Took ${facts.elapsedSeconds}s; the target is ${facts.targetSeconds}s.`);
  }
  return mistakes.slice(0, 4);
}

export function fallbackCoaching(scores: Scores, facts: BuildFacts) {
  if (scores.score >= 0.9) return "Excellent build, right order and right pace. You are ready to make this on shift.";
  if (facts.missing.length || facts.extra.length) {
    return "Study the recipe again and check each ingredient before serving. Getting the right items matters most.";
  }
  if (facts.outOfOrder.length) return "You have the right ingredients; practise the order so it becomes automatic.";
  return "Good accuracy. Work on speed next: aim to finish inside the target time.";
}
