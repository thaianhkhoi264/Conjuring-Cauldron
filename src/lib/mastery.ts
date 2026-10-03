import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { attempts, demoClock, mastery } from "@/lib/db/schema";
import type { Station } from "@/lib/db/types";

export const CERTIFICATION_THRESHOLD = 0.8;
const NEW_WEIGHT = 0.6;

export function currentDemoTime() {
  return db.select().from(demoClock).where(eq(demoClock.id, 1)).get()?.now ?? new Date().toISOString();
}

/**
 * Updates the employee's mastery for a station from a 0..1 score. This is the
 * shared boundary Agent A's evaluator calls (`applyScore(employeeId, "cs", score, source)`).
 * It does not write an attempt row: callers record their own attempt, or use
 * `recordAttempt` below.
 */
export function applyScore(employeeId: string, station: Station, rawScore: number, _source?: string) {
  const score = Math.min(1, Math.max(0, rawScore));
  const now = currentDemoTime();

  const existing = db
    .select()
    .from(mastery)
    .where(and(eq(mastery.employeeId, employeeId), eq(mastery.station, station)))
    .get();

  const next = existing && existing.attempts > 0
    ? NEW_WEIGHT * score + (1 - NEW_WEIGHT) * existing.score
    : score;

  if (existing) {
    db.update(mastery)
      .set({ score: next, attempts: existing.attempts + 1, lastTrainedAt: now })
      .where(eq(mastery.id, existing.id))
      .run();
  } else {
    db.insert(mastery)
      .values({ id: randomUUID(), employeeId, station, score: next, attempts: 1, lastTrainedAt: now })
      .run();
  }

  return { score: next, certified: next >= CERTIFICATION_THRESHOLD };
}

export type RecordAttemptInput = {
  employeeId: string;
  station: Station;
  score: number;
  feedback: unknown;
  durationSeconds?: number;
  recipeId?: string;
};

/** Food/drink path: store the attempt, then update mastery. */
export function recordAttempt(input: RecordAttemptInput) {
  const score = Math.min(1, Math.max(0, input.score));
  db.insert(attempts)
    .values({
      id: randomUUID(),
      employeeId: input.employeeId,
      station: input.station,
      recipeId: input.recipeId,
      score,
      feedbackJson: JSON.stringify(input.feedback),
      durationSeconds: Math.round(input.durationSeconds ?? 0),
      createdAt: currentDemoTime(),
    })
    .run();
  return applyScore(input.employeeId, input.station, score, `recipe:${input.recipeId ?? "unknown"}`);
}

/** Void-returning wrapper that satisfies Agent A's `ScoreApplier` type in src/voice/evaluator.ts. */
export function scoreApplier(employeeId: string, station: Station, score: number, source: string): void {
  applyScore(employeeId, station, score, source);
}
