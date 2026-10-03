import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateSchedule, rankReplacements } from "../src/lib/scheduling/engine";
import type { EngineEmployee, ScheduleInput } from "../src/lib/scheduling/types";

// Uses a throwaway database in the OS temp folder; never the real dev database.
const directory = mkdtempSync(join(tmpdir(), "conjuring-cauldron-calloffs-"));
process.env.DATABASE_URL = join(directory, "test.db");

const WIDE = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "23:59" }));
const person = (id: string, skills: Partial<EngineEmployee["skills"]>, hoursCap = 40): EngineEmployee => ({
  id,
  name: id,
  isNew: false,
  hoursCap,
  skills: { food: 0, drink: 0, cs: 0, ...skills },
  availability: WIDE,
});

// Pure ranking checks -------------------------------------------------------
{
  const input: ScheduleInput = {
    employees: [person("a", { food: 0.9 }), person("b", { food: 0.95 }), person("c", { food: 0.85 }, 0), person("d", { drink: 0.9 }), person("e", { food: 0.5 })],
    shifts: [{ id: "s", date: "2026-10-04", slot: "mid", required: { food: 1, drink: 0, cs: 0 } }],
  };
  const ranked = rankReplacements(input, [], { shiftId: "s", station: "food" }, { exclude: ["a"] });
  assert.deepEqual(ranked.map((r) => r.employeeId), ["b"], "only certified, available, under-cap people who are not excluded");
  assert.ok(ranked[0].reasons.length >= 3);
  assert.deepEqual(rankReplacements(input, [], { shiftId: "missing", station: "food" }), []);
  // A person already on that shift is not a candidate.
  assert.deepEqual(
    rankReplacements(input, [{ shiftId: "s", employeeId: "b", station: "drink", role: "anchor" }], { shiftId: "s", station: "food" }, { exclude: ["a"] }),
    [],
  );
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { assignments, calloffCandidates, calloffs, messages } = await import("../src/lib/db/schema");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed } = await import("../src/lib/db/seed-data");
  const { generateAndSaveSchedule, loadScheduleInput } = await import("../src/lib/scheduling/store");
  const { validateSchedule } = await import("../src/lib/scheduling/rules");
  const calloff = await import("../src/lib/calloffs");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());
  generateAndSaveSchedule();

  const active = () =>
    db.select().from(assignments).where(eq(assignments.status, "scheduled")).all().map((a) => ({
      shiftId: a.shiftId, employeeId: a.employeeId, station: a.station, role: a.role,
    }));
  assert.deepEqual(validateSchedule(loadScheduleInput(), active()), [], "starting schedule is valid");

  // Pick a weekend shift anchor: those have spare weekend staff to cover.
  const target = db.select().from(assignments).where(eq(assignments.shiftId, "shift-2026-10-10-mid")).all().find((a) => a.role === "anchor" && a.station === "food")!;
  assert.ok(target, "seed week has a Saturday mid food anchor");
  const stranger = db.select().from(assignments).all().find((a) => a.employeeId !== target.employeeId && a.role === "anchor")!;

  // Ownership and validity checks.
  const notMine = calloff.createCalloff(stranger.employeeId, target.id, "sick");
  assert.equal(notMine.ok, false, "cannot call off someone else's shift");

  const made = calloff.createCalloff(target.employeeId, target.id, "  flu  ");
  assert.equal(made.ok, true);
  if (!made.ok) return;
  assert.equal(made.needsCover, true);
  assert.equal(calloff.createCalloff(target.employeeId, target.id, "again").ok, false, "cannot call off twice");
  assert.equal(db.select().from(assignments).where(eq(assignments.id, target.id)).get()!.status, "called_off");
  assert.equal(db.select().from(calloffs).where(eq(calloffs.id, made.calloffId)).get()!.reason, "flu");
  assert.ok(db.select().from(messages).where(eq(messages.employeeId, "morgana")).all().some((m) => m.kind === "calloff"), "manager is told");

  // Inbox ranks up to three eligible candidates, never the person calling off.
  let inbox = calloff.listOpenCalloffs();
  assert.equal(inbox.length, 1);
  let item = inbox[0];
  assert.ok(item.candidates.length >= 2, "at least two backup options exist for this shift");
  assert.ok(item.candidates.length <= 3);
  assert.ok(!item.candidates.some((c) => c.employeeId === target.employeeId));
  assert.deepEqual(item.candidates.map((c) => c.rank), item.candidates.map((_, i) => i + 1));
  assert.ok(item.candidates.every((c) => c.status === "proposed" && c.rationale.length > 0));
  // Listing again does not duplicate candidates.
  assert.equal(calloff.listOpenCalloffs()[0].candidates.length, item.candidates.length);
  // The vacated slot shows as uncovered (called-off anchors do not count).
  assert.ok(validateSchedule(loadScheduleInput(), active()).some((v) => v.rule === "coverage"));

  // Manager approves the top candidate; only one offer at a time.
  const first = item.candidates[0];
  const second = item.candidates[1];
  assert.equal(calloff.approveCandidate(made.calloffId, first.id).ok, true);
  assert.equal(calloff.approveCandidate(made.calloffId, second.id).ok, false, "one offer at a time");
  assert.equal(calloff.getMyOffers(first.employeeId).length, 1);
  assert.equal(calloff.getMyOffers(second.employeeId).length, 0);

  // Wrong person cannot answer the offer; the first candidate declines.
  assert.equal(calloff.respondToOffer(first.id, second.employeeId, true).ok, false);
  const declined = calloff.respondToOffer(first.id, first.employeeId, false);
  assert.equal(declined.ok, true);
  assert.equal(db.select().from(calloffCandidates).where(eq(calloffCandidates.id, first.id)).get()!.status, "declined");
  assert.ok(db.select().from(messages).where(eq(messages.employeeId, "morgana")).all().some((m) => m.kind === "calloff-declined"), "manager is told of the decline");

  // The next candidate is available for approval, and the decliner is never proposed again.
  inbox = calloff.listOpenCalloffs();
  item = inbox[0];
  const next = item.candidates.find((c) => c.status === "proposed")!;
  assert.ok(next, "a fallback candidate is proposed");
  assert.notEqual(next.employeeId, first.employeeId);
  assert.ok(!item.candidates.some((c) => c.employeeId === first.employeeId && c.status === "proposed"));

  // Approve and accept: the shift is covered and the whole schedule is valid again.
  assert.equal(calloff.approveCandidate(made.calloffId, next.id).ok, true);
  const accepted = calloff.respondToOffer(next.id, next.employeeId, true);
  assert.equal(accepted.ok, true);
  assert.equal(db.select().from(assignments).where(eq(assignments.id, target.id)).get()!.status, "covered");
  assert.equal(db.select().from(calloffs).where(eq(calloffs.id, made.calloffId)).get()!.status, "resolved");
  assert.deepEqual(validateSchedule(loadScheduleInput(), active()), [], "schedule is fully valid and covered after the swap");
  assert.equal(calloff.listOpenCalloffs().length, 0);
  assert.ok(db.select().from(messages).where(eq(messages.employeeId, target.employeeId)).all().some((m) => m.kind === "calloff-covered"));
  assert.equal(calloff.respondToOffer(next.id, next.employeeId, true).ok, false, "an answered offer cannot be answered twice");

  // A trainee shadow calling off needs no cover and creates no candidates.
  const shadow = db.select().from(assignments).all().find((a) => a.role === "shadow" && a.status === "scheduled")!;
  assert.ok(shadow, "seed schedule has a shadow");
  const shadowOff = calloff.createCalloff(shadow.employeeId, shadow.id, "class");
  assert.equal(shadowOff.ok, true);
  if (shadowOff.ok) {
    assert.equal(shadowOff.needsCover, false);
    assert.equal(db.select().from(calloffs).where(eq(calloffs.id, shadowOff.calloffId)).get()!.status, "resolved");
    assert.equal(db.select().from(calloffCandidates).where(eq(calloffCandidates.calloffId, shadowOff.calloffId)).all().length, 0);
  }
  assert.deepEqual(validateSchedule(loadScheduleInput(), active()).filter((v) => v.rule !== "coverage"), []);

  // A regenerated schedule starts clean again.
  generateAndSaveSchedule();
  assert.deepEqual(validateSchedule(loadScheduleInput(), active()), []);
  assert.equal(generateSchedule(loadScheduleInput()).unfilled.length, 0);

  console.info("Call-off checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
