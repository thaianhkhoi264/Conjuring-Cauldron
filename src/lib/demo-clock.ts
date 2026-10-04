import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { demoClock, employees, mastery, messages } from "@/lib/db/schema";
import { loadDemoSeed } from "@/lib/db/seed";
import { buildDemoSeed } from "@/lib/db/seed-data";
import type { Station } from "@/lib/db/types";
import { CERTIFICATION_THRESHOLD, currentDemoTime } from "@/lib/mastery";
import { ensureUpcomingShifts } from "@/lib/scheduling/store";
import { daysBetween, decayDays, decayedScore, isRetestDue } from "@/lib/training/decay";

const STATION_LABEL: Record<Station, string> = { food: "Food", drink: "Drinks", cs: "Customer Service" };
const DAY_MS = 86_400_000;

export const DEFAULT_SKIP_DAYS = 3;

export type DecayChange = {
  employeeId: string;
  name: string;
  station: Station;
  before: number;
  after: number;
  lostCertification: boolean;
};

export type SkipSummary = {
  from: string;
  to: string;
  days: number;
  decayed: DecayChange[];
  lostCertifications: DecayChange[];
  retestNotices: number;
};

export function getDemoDate() {
  return currentDemoTime().slice(0, 10);
}

/**
 * Move the demo clock forward, decay skills that have gone stale, roll the shift calendar
 * forward and tell affected employees which stations need a retest. One transaction for
 * the clock and the scores, so a failure leaves everything unchanged.
 */
export function skipAhead(days = DEFAULT_SKIP_DAYS): SkipSummary {
  const safeDays = Math.max(1, Math.min(14, Math.floor(days)));
  const before = currentDemoTime();
  const after = new Date(Date.parse(before) + safeDays * DAY_MS).toISOString();
  const names = new Map(db.select({ id: employees.id, name: employees.name }).from(employees).all().map((e) => [e.id, e.name]));

  const decayed: DecayChange[] = [];
  db.transaction((tx) => {
    for (const row of tx.select().from(mastery).all()) {
      const staleBefore = row.lastTrainedAt ? Math.max(0, daysBetween(row.lastTrainedAt, before)) : 0;
      const score = decayedScore(row.score, decayDays(staleBefore, safeDays));
      if (score === row.score) continue;
      tx.update(mastery).set({ score }).where(eq(mastery.id, row.id)).run();
      decayed.push({
        employeeId: row.employeeId,
        name: names.get(row.employeeId) ?? row.employeeId,
        station: row.station,
        before: row.score,
        after: score,
        lostCertification: row.score >= CERTIFICATION_THRESHOLD && score < CERTIFICATION_THRESHOLD,
      });
    }
    tx.update(demoClock).set({ now: after }).where(eq(demoClock.id, 1)).run();
  });

  ensureUpcomingShifts();

  // One notice per employee listing every station that is now due for a retest.
  const due = new Map<string, string[]>();
  for (const row of db.select().from(mastery).all()) {
    if (!isRetestDue(row.lastTrainedAt, after, row.attempts)) continue;
    const list = due.get(row.employeeId) ?? [];
    const slipped = decayed.find((d) => d.employeeId === row.employeeId && d.station === row.station && d.lostCertification);
    list.push(slipped ? `${STATION_LABEL[row.station]} (slipped below ${Math.round(CERTIFICATION_THRESHOLD * 100)}%)` : STATION_LABEL[row.station]);
    due.set(row.employeeId, list);
  }
  for (const [employeeId, stations] of due) {
    db.insert(messages)
      .values({
        id: randomUUID(),
        employeeId,
        kind: "retest",
        body: `Time for a quick retest: ${stations.join(", ")}. A short session keeps your certification current.`,
        read: false,
        createdAt: after,
      })
      .run();
  }

  return {
    from: before.slice(0, 10),
    to: after.slice(0, 10),
    days: safeDays,
    decayed,
    lostCertifications: decayed.filter((d) => d.lostCertification),
    retestNotices: due.size,
  };
}

/** Restore the seeded demo state: people, skills, shifts, empty schedule, and the demo clock. */
export function resetDemo() {
  loadDemoSeed(db, buildDemoSeed());
}

export type RetestDue = { station: Station; label: string; daysSince: number; score: number; certified: boolean };

/** Stations this employee has trained before but not within the retest interval. */
export function getRetestsDue(employeeId: string): RetestDue[] {
  const now = currentDemoTime();
  return db
    .select()
    .from(mastery)
    .where(eq(mastery.employeeId, employeeId))
    .all()
    .filter((row) => isRetestDue(row.lastTrainedAt, now, row.attempts))
    .map((row) => ({
      station: row.station,
      label: STATION_LABEL[row.station],
      daysSince: daysBetween(row.lastTrainedAt!, now),
      score: row.score,
      certified: row.score >= CERTIFICATION_THRESHOLD,
    }));
}
