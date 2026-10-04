import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { assignments, demoClock, employees, mastery, messages, shifts } from "@/lib/db/schema";
import { loadDemoSeed } from "@/lib/db/seed";
import { buildDemoSeed } from "@/lib/db/seed-data";
import type { Station } from "@/lib/db/types";
import { CERTIFICATION_THRESHOLD, currentDemoTime } from "@/lib/mastery";
import { ensureUpcomingShifts } from "@/lib/scheduling/store";
import {
  daysBetween,
  decayDaysBetween,
  decayedScore,
  experienceFor,
  isRetestDue,
  latestOf,
  practisedScore,
} from "@/lib/training/decay";

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

/** Practice earned by working shifts at a station while the clock moved. */
export type PracticeChange = {
  employeeId: string;
  name: string;
  station: Station;
  anchorShifts: number;
  shadowShifts: number;
  before: number;
  after: number;
};

export type SkipSummary = {
  from: string;
  to: string;
  days: number;
  decayed: DecayChange[];
  lostCertifications: DecayChange[];
  retestNotices: number;
  /** Shifts worked while the clock moved, by station: working counts as practice and keeps skills fresh. */
  practised: PracticeChange[];
  shiftsWorked: number;
};

export function getDemoDate() {
  return currentDemoTime().slice(0, 10);
}

type Worked = { anchors: number; shadows: number; lastDate: string };

/** Scheduled shifts whose date falls in [fromDate, toDate): the ones worked while the clock moves. */
function workedBetween(fromDate: string, toDate: string) {
  const worked = new Map<string, Worked>();
  const rows = db
    .select({ employeeId: assignments.employeeId, station: assignments.station, role: assignments.role, date: shifts.date })
    .from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .where(eq(assignments.status, "scheduled"))
    .all();
  for (const row of rows) {
    if (row.date < fromDate || row.date >= toDate) continue;
    const key = `${row.employeeId}|${row.station}`;
    const entry = worked.get(key) ?? { anchors: 0, shadows: 0, lastDate: row.date };
    if (row.role === "anchor") entry.anchors++;
    else entry.shadows++;
    if (row.date > entry.lastDate) entry.lastDate = row.date;
    worked.set(key, entry);
  }
  return worked;
}

/**
 * Move the demo clock forward, give credit for shifts that were worked, decay skills that have gone
 * stale, roll the shift calendar forward and tell affected employees which stations need a retest.
 *
 * Working a shift at a station is practice: it resets that skill's staleness clock, sharpens the score
 * a little (up to a ceiling) and builds experience, which makes later decay and retests gentler.
 * One transaction for the clock and the scores, so a failure leaves everything unchanged.
 */
export function skipAhead(days = DEFAULT_SKIP_DAYS): SkipSummary {
  const safeDays = Math.max(1, Math.min(14, Math.floor(days)));
  const before = currentDemoTime();
  const after = new Date(Date.parse(before) + safeDays * DAY_MS).toISOString();
  const names = new Map(db.select({ id: employees.id, name: employees.name }).from(employees).all().map((e) => [e.id, e.name]));
  const worked = workedBetween(before.slice(0, 10), after.slice(0, 10));

  const decayed: DecayChange[] = [];
  const practised: PracticeChange[] = [];
  db.transaction((tx) => {
    for (const row of tx.select().from(mastery).all()) {
      const lastUsed = latestOf(row.lastTrainedAt, row.lastWorkedAt);
      const staleBefore = lastUsed ? Math.max(0, daysBetween(lastUsed, before)) : 0;
      const w = worked.get(`${row.employeeId}|${row.station}`);

      let score = row.score;
      let experience = row.experience;
      let lastWorkedAt = row.lastWorkedAt;
      let staleAfter = staleBefore + safeDays;
      if (w) {
        const workedAt = `${w.lastDate}T23:00:00.000Z`;
        score = practisedScore(score, w.anchors, w.shadows);
        experience += experienceFor(w.anchors, w.shadows);
        lastWorkedAt = latestOf(lastWorkedAt, workedAt);
        staleAfter = Math.max(0, daysBetween(latestOf(lastUsed, workedAt)!, after));
      }

      const next = decayedScore(score, decayDaysBetween(staleBefore, staleAfter), experience);
      if (next !== row.score || experience !== row.experience || lastWorkedAt !== row.lastWorkedAt) {
        tx.update(mastery).set({ score: next, experience, lastWorkedAt }).where(eq(mastery.id, row.id)).run();
      }

      const name = names.get(row.employeeId) ?? row.employeeId;
      if (w) {
        practised.push({ employeeId: row.employeeId, name, station: row.station, anchorShifts: w.anchors, shadowShifts: w.shadows, before: row.score, after: next });
      }
      if (next < row.score - 1e-9) {
        decayed.push({
          employeeId: row.employeeId,
          name,
          station: row.station,
          before: row.score,
          after: next,
          lostCertification: row.score >= CERTIFICATION_THRESHOLD && next < CERTIFICATION_THRESHOLD,
        });
      }
    }
    tx.update(demoClock).set({ now: after }).where(eq(demoClock.id, 1)).run();
  });

  ensureUpcomingShifts();

  // One notice per employee listing every station that is now due for a retest.
  const due = new Map<string, string[]>();
  for (const row of db.select().from(mastery).all()) {
    if (!retestDue(row, after)) continue;
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
    practised,
    shiftsWorked: practised.reduce((n, p) => n + p.anchorShifts + p.shadowShifts, 0),
  };
}

/** Restore the seeded demo state: people, skills, shifts, empty schedule, and the demo clock. */
export function resetDemo() {
  loadDemoSeed(db, buildDemoSeed());
}

type MasteryRow = typeof mastery.$inferSelect;

/** Whether a station is due for a retest: stale for long enough, with experienced and still certified people exempt. */
function retestDue(row: MasteryRow, nowIso: string) {
  return isRetestDue(latestOf(row.lastTrainedAt, row.lastWorkedAt), nowIso, row.attempts, {
    experience: row.experience,
    score: row.score,
    certifiedAt: CERTIFICATION_THRESHOLD,
  });
}

export type RetestDue = { station: Station; label: string; daysSince: number; score: number; certified: boolean };

/** Stations this employee has trained before but not used (trained or worked) within the retest interval. */
export function getRetestsDue(employeeId: string): RetestDue[] {
  const now = currentDemoTime();
  return db
    .select()
    .from(mastery)
    .where(eq(mastery.employeeId, employeeId))
    .all()
    .filter((row) => retestDue(row, now))
    .map((row) => ({
      station: row.station,
      label: STATION_LABEL[row.station],
      daysSince: daysBetween(latestOf(row.lastTrainedAt, row.lastWorkedAt)!, now),
      score: row.score,
      certified: row.score >= CERTIFICATION_THRESHOLD,
    }));
}
