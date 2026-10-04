import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decayedScore,
  decayFloor,
  decayRate,
  EXPERIENCED_AT,
  isRetestDue,
  PRACTICE_CEILING,
  practisedScore,
  retestInterval,
  SHADOW_CEILING,
} from "../src/lib/training/decay";
import { generateSchedule, rankReplacements } from "../src/lib/scheduling/engine";
import { describePreference, parsePreference, preferenceFit } from "../src/lib/scheduling/preference";
import type { EngineEmployee, EngineShift, ScheduleInput, Station } from "../src/lib/scheduling/types";

// Uses a throwaway database in the OS temp folder; never the real dev database.
process.env.DATABASE_URL = join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-exp-")), "test.db");

// ---- Experience makes decay and retests gentler -----------------------------------------------------------
assert.ok(decayRate(20) < decayRate(0) / 2, "an experienced person forgets much more slowly");
assert.ok(decayFloor(20) > decayFloor(0), "and keeps a higher floor");
assert.equal(decayedScore(0.9, 5, 0), 0.85, "no experience: the original rate");
assert.ok(decayedScore(0.9, 5, 20) > decayedScore(0.9, 5, 0), "the same time away costs the experienced less");
assert.ok(decayedScore(0.31, 50, 20) >= decayFloor(20) - 1e-9 || 0.31 < decayFloor(20), "never below the raised floor");
assert.equal(decayedScore(0.5, 0, 20), 0.5, "no decay days, no change");

// ---- Practice -----------------------------------------------------------------------------------------------
assert.ok(practisedScore(0.85, 3, 0) > 0.85, "working shifts sharpens a certified skill");
assert.equal(practisedScore(0.89, 5, 0), PRACTICE_CEILING, "but only up to the ceiling");
assert.equal(practisedScore(0.95, 5, 0), 0.95, "never lowers a better score");
assert.ok(practisedScore(0.5, 0, 4) > 0.5, "shadowing builds a trainee's skill");
assert.equal(practisedScore(0.69, 0, 10), SHADOW_CEILING, "but shadowing alone can never certify");
assert.ok(SHADOW_CEILING < 0.8 && PRACTICE_CEILING >= 0.8);

// ---- Retests ------------------------------------------------------------------------------------------------
const last = "2026-10-01T09:00:00.000Z";
const now = "2026-10-05T09:00:00.000Z"; // 4 days later
assert.equal(isRetestDue(last, now, 1, { experience: 0, score: 0.85 }), true, "a newcomer is due after 3+ days");
assert.equal(isRetestDue(last, now, 1, { experience: 8, score: 0.85 }), false, "experience stretches the interval to 5 days");
assert.equal(isRetestDue(last, "2026-12-01T09:00:00.000Z", 1, { experience: EXPERIENCED_AT, score: 0.85 }), false, "experienced and certified: never");
assert.equal(isRetestDue(last, now, 1, { experience: EXPERIENCED_AT, score: 0.75 }), true, "but a slipped skill is asked for a retest");
assert.equal(retestInterval(40, 0.7), retestInterval(0, 0.7), "slipped skills get no experience grace");

// ---- Preferences: validation and fit -----------------------------------------------------------------------
assert.deepEqual(parsePreference({ liked: ["close"], avoided: ["open"], days: "weekends" }), {
  ok: true,
  value: { liked: ["close"], avoided: ["open"], days: "weekends" },
});
assert.equal(parsePreference({ liked: ["close"], avoided: ["close"] }).ok, false, "cannot like and avoid the same shift");
assert.equal(parsePreference({ liked: ["lunch"] }).ok, false, "unknown shift");
assert.equal(parsePreference({ days: "someday" }).ok, false, "unknown days");
assert.equal(parsePreference({ liked: ["open", "mid", "close"] }).ok, false, "every shift is no preference");
assert.equal(preferenceFit(undefined, { date: "2026-10-04", slot: "close" }), 0);
assert.equal(preferenceFit({ liked: ["close"], avoided: [], days: "weekends" }, { date: "2026-10-04", slot: "close" }), 1.5, "Sunday close");
assert.equal(preferenceFit({ liked: ["close"], avoided: [], days: "weekends" }, { date: "2026-10-05", slot: "open" }), -0.5, "Monday open is a weekday");
assert.equal(describePreference({ liked: ["close"], avoided: ["open"], days: "weekends" }), "Prefers closing shifts and weekends; would rather avoid opening shifts");
assert.equal(describePreference(undefined), "No preferences");

// ---- Preferences nudge the scheduler without breaking rules ---------------------------------------------------
const WIDE = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "23:59" }));
function emp(id: string, skills: Partial<Record<Station, number>>, extra: Partial<EngineEmployee> = {}): EngineEmployee {
  return { id, name: id, isNew: false, hoursCap: 40, skills: { food: 0, drink: 0, cs: 0, ...skills }, availability: WIDE, ...extra };
}
function shift(id: string, date: string, slot: EngineShift["slot"], required: Partial<Record<Station, number>>): EngineShift {
  return { id, date, slot, required: { food: 0, drink: 0, cs: 0, ...required } };
}
const SUN = "2026-10-04";
const MON = "2026-10-05";

{
  // Two equal cooks, one close shift: the one who prefers closing gets it, whatever their ids sort like.
  for (const closer of ["a", "z"]) {
    const other = closer === "a" ? "z" : "a";
    const input: ScheduleInput = {
      employees: [
        emp(closer, { food: 0.9 }, { preference: { liked: ["close"], avoided: ["open"], days: "any" } }),
        emp(other, { food: 0.9 }, { preference: { liked: ["open"], avoided: ["close"], days: "any" } }),
      ],
      shifts: [shift("c", SUN, "close", { food: 1 }), shift("o", SUN, "open", { food: 1 })],
    };
    const result = generateSchedule(input);
    const byShift = Object.fromEntries(result.assignments.map((a) => [a.shiftId, a.employeeId]));
    assert.deepEqual(byShift, { c: closer, o: other }, "each gets the shift they asked for");
    assert.deepEqual(result.stats.preferences, { matched: 2, against: 0 });
  }
}
{
  // Weekend preference: the weekend lover gets Sunday, the weekday lover gets Monday.
  const input: ScheduleInput = {
    employees: [
      emp("a", { drink: 0.9 }, { preference: { liked: [], avoided: [], days: "weekdays" } }),
      emp("b", { drink: 0.9 }, { preference: { liked: [], avoided: [], days: "weekends" } }),
    ],
    shifts: [shift("sun", SUN, "mid", { drink: 1 }), shift("mon", MON, "mid", { drink: 1 })],
  };
  const byShift = Object.fromEntries(generateSchedule(input).assignments.map((a) => [a.shiftId, a.employeeId]));
  assert.deepEqual(byShift, { sun: "b", mon: "a" });
}
{
  // Preferences are soft: the only certified person works a shift they would rather avoid, and the slot is not left empty.
  const input: ScheduleInput = {
    employees: [emp("solo", { food: 0.9 }, { preference: { liked: [], avoided: ["open"], days: "any" } })],
    shifts: [shift("o", SUN, "open", { food: 1 })],
  };
  const result = generateSchedule(input);
  assert.equal(result.unfilled.length, 0);
  assert.equal(result.assignments[0].employeeId, "solo");
  assert.deepEqual(result.stats.preferences, { matched: 0, against: 1 });
  assert.match(result.assignments[0].note, /Against their shift preferences/);
}
{
  // Preferences never override the hard rules: the person who prefers this shift is not certified, so they are not used.
  const input: ScheduleInput = {
    employees: [
      emp("wants", { food: 0.6 }, { preference: { liked: ["close"], avoided: [], days: "any" } }),
      emp("able", { food: 0.9 }, { preference: { liked: [], avoided: ["close"], days: "any" } }),
    ],
    shifts: [shift("c", SUN, "close", { food: 1 })],
  };
  assert.equal(generateSchedule(input).assignments[0].employeeId, "able");
}
{
  // Cover for a call-off prefers the person who likes that shift.
  const input: ScheduleInput = {
    employees: [
      emp("x", { food: 0.9 }, { preference: { liked: [], avoided: ["close"], days: "any" } }),
      emp("y", { food: 0.9 }, { preference: { liked: ["close"], avoided: [], days: "any" } }),
    ],
    shifts: [shift("c", SUN, "close", { food: 1 })],
  };
  const ranked = rankReplacements(input, [], { shiftId: "c", station: "food" });
  assert.equal(ranked[0].employeeId, "y");
  assert.ok(ranked[0].reasons.some((r) => /preferences/.test(r)));
}

// ---- The request / approval flow in a database -----------------------------------------------------------------------
async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { messages, preferenceRequests } = await import("../src/lib/db/schema");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed } = await import("../src/lib/db/seed-data");
  const prefs = await import("../src/lib/preferences");
  const store = await import("../src/lib/scheduling/store");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());

  // The seed has approved preferences (used by the scheduler) and pending ones (waiting for the manager).
  assert.ok(prefs.getActivePreferences().has("selene"));
  assert.ok(!prefs.getActivePreferences().has("juniper"), "pending requests are not used by the scheduler");
  assert.ok(store.loadScheduleInput().employees.find((e) => e.id === "selene")!.preference, "approved preferences reach the engine");
  assert.ok(!store.loadScheduleInput().employees.find((e) => e.id === "juniper")!.preference);
  assert.deepEqual(prefs.listPendingRequests().map((r) => r.employeeId).sort(), ["juniper", "wren"]);

  // Submitting validates, replaces an older pending request, and rejects a no-op.
  assert.equal(prefs.submitPreference("finch", { liked: ["lunch"] }).ok, false);
  assert.equal(prefs.submitPreference("selene", { liked: ["close"], days: "weekends" }).ok, false, "same as the current preference");
  const first = prefs.submitPreference("finch", { liked: ["mid"], days: "any", note: "x".repeat(500) });
  assert.ok(first.ok);
  const second = prefs.submitPreference("finch", { liked: ["close"], avoided: ["open"], days: "weekends" });
  assert.ok(second.ok);
  const finchPending = prefs.listPendingRequests().filter((r) => r.employeeId === "finch");
  assert.equal(finchPending.length, 1, "only the latest request stays open");
  assert.equal(finchPending[0].id, second.ok ? second.id : "");
  assert.equal(prefs.getMyPreferenceState("finch").active, null, "not active until approved");

  // Accepting makes it active, tells the employee, and cannot be decided twice.
  const accepted = prefs.decideRequest(finchPending[0].id, "accept", "Sounds good!");
  assert.deepEqual(accepted, { ok: true, status: "accepted" });
  assert.deepEqual(prefs.getMyPreferenceState("finch").active, { liked: ["close"], avoided: ["open"], days: "weekends" });
  assert.equal(prefs.decideRequest(finchPending[0].id, "reject").ok, false);
  const note = db.select().from(messages).where(eq(messages.employeeId, "finch")).all().find((m) => m.kind === "preference");
  assert.ok(note && /approved/.test(note.body) && /Sounds good!/.test(note.body));

  // Rejecting leaves the old preference in place and says so.
  const again = prefs.submitPreference("finch", { liked: ["open"] });
  assert.ok(again.ok);
  assert.deepEqual(prefs.decideRequest(again.ok ? again.id : "", "reject", "Mornings are full"), { ok: true, status: "rejected" });
  const state = prefs.getMyPreferenceState("finch");
  assert.deepEqual(state.active, { liked: ["close"], avoided: ["open"], days: "weekends" }, "the earlier approval stands");
  assert.equal(state.rejected?.managerNote, "Mornings are full");
  assert.equal(state.pending, null);

  // Approved preferences shape a real generated week.
  const result = store.generateAndSaveSchedule();
  assert.equal(result.unfilled.length, 0, "preferences never cost coverage");
  assert.ok(result.stats.preferences!.matched > 0);

  // A later approval of "no preference" clears it.
  const clear = prefs.submitPreference("finch", {});
  assert.ok(clear.ok);
  prefs.decideRequest(clear.ok ? clear.id : "", "accept");
  assert.equal(prefs.getMyPreferenceState("finch").active, null);
  assert.equal(db.select().from(preferenceRequests).where(eq(preferenceRequests.employeeId, "finch")).all().length, 3);

  console.info("Experience and preference checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
