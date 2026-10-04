import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DECAY_FLOOR,
  decayDays,
  decayedScore,
  GRACE_DAYS,
  isRetestDue,
} from "../src/lib/training/decay";
import { addDays, buildWeekShifts, missingShifts, planningWindow } from "../src/lib/scheduling/weeks";

// Uses a throwaway database in the OS temp folder; never the real dev database.
process.env.DATABASE_URL = join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-clock-")), "test.db");

// Pure decay rules -----------------------------------------------------------
assert.equal(decayDays(0, 1), 0, "inside the grace period nothing decays");
assert.equal(decayDays(0, GRACE_DAYS), 0);
assert.equal(decayDays(1, 3), 2, "only the days past the grace period count");
assert.equal(decayDays(5, 3), 3, "already-stale skills decay for every new day");
for (let stale = 0; stale <= 8; stale++) {
  assert.equal(decayDays(stale, 3) + decayDays(stale + 3, 3), decayDays(stale, 6), `two skips equal one long skip (stale ${stale})`);
}
assert.equal(decayedScore(0.9, 0), 0.9);
assert.equal(decayedScore(0.9, 3), 0.87);
assert.equal(decayedScore(0.31, 10), DECAY_FLOOR, "never below the floor");
assert.equal(decayedScore(0.2, 10), 0.2, "a score already under the floor is left alone");
assert.equal(isRetestDue("2026-10-01T09:00:00.000Z", "2026-10-04T09:00:00.000Z", 1), true);
assert.equal(isRetestDue("2026-10-02T09:00:00.000Z", "2026-10-04T09:00:00.000Z", 1), false);
assert.equal(isRetestDue(null, "2026-10-04T09:00:00.000Z", 1), false);
assert.equal(isRetestDue("2026-09-01T09:00:00.000Z", "2026-10-04T09:00:00.000Z", 0), false, "never trained, nothing to retest");

// Pure calendar rules ----------------------------------------------------------
assert.deepEqual(planningWindow("2026-10-03T09:00:00.000Z"), { from: "2026-10-04", to: "2026-10-10" });
assert.deepEqual(planningWindow("2026-10-06T09:00:00.000Z"), { from: "2026-10-07", to: "2026-10-13" });
assert.equal(addDays("2026-10-31", 1), "2026-11-01");
assert.equal(buildWeekShifts("2026-10-04").length, 21);
const week = buildWeekShifts("2026-10-04");
assert.deepEqual(JSON.parse(week.find((s) => s.id === "shift-2026-10-04-mid")!.requiredJson), { food: 2, drink: 1, cs: 1 }, "Sunday mid is busy");
assert.deepEqual(JSON.parse(week.find((s) => s.id === "shift-2026-10-06-open")!.requiredJson), { food: 1, drink: 1, cs: 0 }, "open is prep only");
assert.deepEqual(missingShifts(week.map((s) => s.date), "2026-10-10"), [], "nothing missing when covered");
assert.equal(missingShifts(week.map((s) => s.date), "2026-10-13").length, 9, "three more days of three shifts");
assert.equal(missingShifts([], "2026-10-13").length, 0);

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { assignments, demoClock, mastery, messages, shifts } = await import("../src/lib/db/schema");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed, DEMO_NOW } = await import("../src/lib/db/seed-data");
  const store = await import("../src/lib/scheduling/store");
  const clock = await import("../src/lib/demo-clock");
  const { recordAttempt } = await import("../src/lib/mastery");
  const { createCalloff } = await import("../src/lib/calloffs");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());
  const first = store.generateAndSaveSchedule();
  assert.equal(first.unfilled.length, 0);
  assert.deepEqual(store.getScheduleHealth(), { hasSchedule: true, gaps: 0, issues: [] }, "a fresh schedule is healthy");

  const scoreBefore = new Map(db.select().from(mastery).all().map((m) => [m.id, m.score]));
  const summary = clock.skipAhead(3);

  // Clock moved exactly three days.
  assert.equal(summary.from, "2026-10-03");
  assert.equal(summary.to, "2026-10-06");
  assert.equal(db.select().from(demoClock).get()!.now, "2026-10-06T09:00:00.000Z");
  assert.equal(clock.getDemoDate(), "2026-10-06");

  // Skills slipped, never rose, never went below the floor, and the report matches the database.
  const scoreAfter = db.select().from(mastery).all();
  assert.ok(summary.decayed.length > 0, "something decayed");
  for (const row of scoreAfter) {
    assert.ok(row.score <= scoreBefore.get(row.id)! + 1e-9, "scores never go up from decay");
    assert.ok(row.score >= DECAY_FLOOR - 1e-9 || scoreBefore.get(row.id)! < DECAY_FLOOR);
  }
  for (const change of summary.decayed) {
    assert.ok(change.after < change.before);
    assert.equal(change.lostCertification, change.before >= 0.8 && change.after < 0.8);
  }
  assert.ok(summary.lostCertifications.length > 0, "at least one certification slips so retests matter");
  assert.ok(summary.lostCertifications.length <= 12, "but the demo does not collapse");

  // Retest notices exist for trained staff, not for the untrained new hire.
  assert.ok(summary.retestNotices > 0);
  assert.equal(db.select().from(messages).where(eq(messages.employeeId, "finch")).all().filter((m) => m.kind === "retest").length, 0);
  const odetteRetests = clock.getRetestsDue("odette");
  assert.ok(odetteRetests.length > 0, "Odette is due to retest");

  // The calendar rolled forward: three new days of shifts exist and the window shows exactly a week.
  const dates = db.select({ date: shifts.date }).from(shifts).all().map((s) => s.date);
  assert.ok(dates.includes("2026-10-13"));
  const view = store.getScheduleView();
  assert.equal(view.length, 21);
  assert.equal(view[0].date, "2026-10-07");
  assert.equal(view.at(-1)!.date, "2026-10-13");

  // The old schedule no longer fits: slipped certifications and the new empty days are flagged.
  const health = store.getScheduleHealth();
  assert.ok(health.issues.length > 0, "someone is scheduled where they are no longer certified");
  assert.ok(health.gaps > 0, "new days have no staff yet");

  // Regenerating restaffs the window from current skills and is healthy again.
  const second = store.generateAndSaveSchedule();
  assert.equal(second.unfilled.length, 0, "the week is still fully covered after the skip");
  assert.deepEqual(store.getScheduleHealth(), { hasSchedule: true, gaps: 0, issues: [] });
  assert.ok(!second.assignments.some((a) => a.shiftId < "shift-2026-10-07"), "past shifts are not rescheduled");

  // Past shifts cannot be called off.
  const past = db.select().from(assignments).all().find((a) => a.shiftId.startsWith("shift-2026-10-05") && a.status === "scheduled");
  assert.ok(past, "week one assignments for 10-05 are kept as history");
  const pastCall = createCalloff(past!.employeeId, past!.id, "late");
  assert.equal(pastCall.ok, false);

  // Training resets the clock on a station: Odette retests drinks and is no longer due for it.
  recordAttempt({ employeeId: "odette", station: "drink", score: 0.95, feedback: {}, recipeId: "moonwater-fizz" });
  assert.ok(!clock.getRetestsDue("odette").some((r) => r.station === "drink"));
  assert.equal(db.select().from(mastery).where(eq(mastery.id, "mastery-odette-drink")).get()!.lastTrainedAt, "2026-10-06T09:00:00.000Z");

  // A second skip only decays the days that have not already been decayed.
  const before2 = db.select().from(mastery).where(eq(mastery.id, "mastery-rook-food")).get()!;
  clock.skipAhead(3);
  const after2 = db.select().from(mastery).where(eq(mastery.id, "mastery-rook-food")).get()!;
  assert.ok(after2.score < before2.score);

  // Reset puts everything back.
  clock.resetDemo();
  assert.equal(db.select().from(demoClock).get()!.now, DEMO_NOW);
  assert.equal(db.select().from(assignments).all().length, 0);
  assert.equal(db.select().from(mastery).where(eq(mastery.id, "mastery-odette-drink")).get()!.score, 0.8);
  assert.equal(db.select().from(shifts).all().length, 21);

  console.info("Demo clock checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
