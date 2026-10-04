import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Uses a throwaway database in the OS temp folder; never the real dev database.
// No Gemini calls: this checks everything around the model (rules, tools, apply).
process.env.DATABASE_URL = join(mkdtempSync(join(tmpdir(), "conjuring-cauldron-agent-")), "test.db");

import { previewChanges } from "../src/lib/scheduling/changes";
import type { EngineEmployee, ScheduleInput } from "../src/lib/scheduling/types";

// Pure change checks -----------------------------------------------------------
const WIDE = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "23:59" }));
const person = (id: string, skills: Partial<EngineEmployee["skills"]>, hoursCap = 40): EngineEmployee => ({
  id,
  name: id.toUpperCase(),
  isNew: false,
  hoursCap,
  skills: { food: 0, drink: 0, cs: 0, ...skills },
  availability: WIDE,
});
{
  const input: ScheduleInput = {
    employees: [person("a", { food: 0.9 }), person("b", { food: 0.9 }), person("c", { food: 0.5 }), person("d", { drink: 0.9 }, 4)],
    shifts: [
      { id: "shift-2026-10-04-mid", date: "2026-10-04", slot: "mid", required: { food: 1, drink: 0, cs: 0 } },
      { id: "shift-2026-10-05-mid", date: "2026-10-05", slot: "mid", required: { food: 1, drink: 0, cs: 0 } },
    ],
  };
  const current = [{ shiftId: "shift-2026-10-04-mid", employeeId: "a", station: "food" as const, role: "anchor" as const }];
  const at = { date: "2026-10-04", slot: "mid" as const, station: "food" as const };

  const swap = previewChanges(input, current, [{ action: "remove", employeeId: "a", ...at }, { action: "add", employeeId: "b", ...at }]);
  assert.equal(swap.ok, true);
  assert.deepEqual(swap.newGaps, []);
  assert.equal(swap.lines.length, 2);

  const removeOnly = previewChanges(input, current, [{ action: "remove", employeeId: "a", ...at }]);
  assert.equal(removeOnly.ok, true, "leaving a slot empty is allowed but reported");
  assert.equal(removeOnly.newGaps.length, 1);

  const uncertified = previewChanges(input, current, [{ action: "remove", employeeId: "a", ...at }, { action: "add", employeeId: "c", ...at }]);
  assert.equal(uncertified.ok, false);
  assert.ok(uncertified.violations.some((v) => v.includes("not certified")));

  assert.equal(previewChanges(input, current, [{ action: "remove", employeeId: "b", ...at }]).ok, false, "cannot remove someone who is not scheduled");
  assert.equal(previewChanges(input, current, [{ action: "add", employeeId: "a", ...at }]).ok, false, "cannot double book");
  assert.equal(previewChanges(input, current, [{ action: "add", employeeId: "zzz", ...at }]).ok, false, "unknown employee");
  assert.equal(previewChanges(input, current, [{ action: "add", employeeId: "b", date: "2026-12-25", slot: "mid", station: "food" }]).ok, false, "shift outside the week");
  assert.equal(previewChanges(input, current, []).ok, false);
  assert.equal(previewChanges(input, current, "nonsense").ok, false);
  assert.equal(previewChanges(input, current, [{ action: "explode", employeeId: "a", ...at }]).ok, false);
  assert.equal(previewChanges(input, current, Array(13).fill({ action: "remove", employeeId: "a", ...at })).ok, false, "too many changes");
  assert.deepEqual(current.length, 1, "the original schedule array is never mutated");

  // Hours cap: D can only work one 4h shift.
  const overCap = previewChanges(
    input,
    [{ shiftId: "shift-2026-10-04-mid", employeeId: "d", station: "drink", role: "anchor" }],
    [{ action: "add", employeeId: "d", date: "2026-10-05", slot: "mid", station: "drink" }],
  );
  assert.equal(overCap.ok, false);
  assert.ok(overCap.violations.some((v) => v.includes("cap")));
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { assignments, messages } = await import("../src/lib/db/schema");
  const { loadDemoSeed } = await import("../src/lib/db/seed");
  const { buildDemoSeed } = await import("../src/lib/db/seed-data");
  const store = await import("../src/lib/scheduling/store");
  const { commitChanges } = await import("../src/lib/scheduling/apply");
  const { createScheduleTools, findEmployee } = await import("../src/lib/scheduling/agent-tools");
  const { validateSchedule } = await import("../src/lib/scheduling/rules");

  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  loadDemoSeed(db, buildDemoSeed());
  store.generateAndSaveSchedule();

  const input = store.loadScheduleInput();
  assert.ok("employee" in findEmployee(input, "elowen"));
  assert.ok("employee" in findEmployee(input, "Elowen"));
  assert.ok("error" in findEmployee(input, "S"), "an ambiguous name is an error, not a guess");
  assert.ok("error" in findEmployee(input, "Nobody"));

  const { tools, getProposal } = createScheduleTools();
  const run = async (name: string, args: Record<string, unknown> = {}) => tools.find((t) => t.declaration.name === name)!.run(args);

  // Read tools.
  const schedule = (await run("get_schedule")) as { health: { gaps: number; issues: string[] }; shifts: { staff: string[]; uncovered: string[] }[] };
  assert.equal(schedule.shifts.length, 21);
  assert.equal(schedule.health.gaps, 0);
  assert.ok(schedule.shifts.every((s) => s.uncovered.length === 0));
  assert.ok(schedule.shifts.some((s) => s.staff.some((line) => line.includes("(shadow)"))));

  const team = (await run("get_team")) as { name: string; skills: Record<string, string>; hours: string }[];
  assert.equal(team.length, 15);
  assert.ok(team.find((t) => t.name === "Elowen")!.skills.Food.includes("certified"));

  // Pick a real anchor assignment and find a legal replacement for it.
  const active = store.loadActiveAssignments(input);
  const names = new Map(input.employees.map((e) => [e.id, e.name]));
  const target = active.find((a) => a.shiftId === "shift-2026-10-10-mid" && a.role === "anchor" && a.station === "food")!;
  const shift = input.shifts.find((s) => s.id === target.shiftId)!;
  const at = { date: shift.date, slot: shift.slot, station: target.station };

  const options = (await run("find_replacements", { ...at, excludeEmployee: names.get(target.employeeId) })) as { rank: number; name: string }[];
  assert.ok(Array.isArray(options) && options.length > 0);
  assert.equal(options[0].rank, 1);
  assert.ok(!options.some((o) => o.name === names.get(target.employeeId)));
  assert.ok("error" in ((await run("find_replacements", { date: "2030-01-01", slot: "mid", station: "food" })) as object));

  const explained = (await run("explain_assignment", { employee: names.get(target.employeeId), ...at })) as { rankAmongEligible: string; bestAlternatives: unknown[] };
  assert.match(explained.rankAmongEligible, /^\d+ of \d+$/);
  assert.ok(explained.bestAlternatives.length > 0);
  assert.ok("error" in ((await run("explain_assignment", { employee: "Finch", ...at })) as object), "not scheduled -> error");

  // propose_changes: a legal swap is allowed but nothing is written yet.
  const replacement = options[0].name;
  const before = JSON.stringify(db.select().from(assignments).all());
  const proposed = (await run("propose_changes", {
    summary: "Swap for test",
    changes: [
      { action: "remove", employee: names.get(target.employeeId), ...at },
      { action: "add", employee: replacement, ...at },
    ],
  })) as { allowed: boolean };
  assert.equal(proposed.allowed, true);
  assert.equal(JSON.stringify(db.select().from(assignments).all()), before, "proposing never changes the schedule");
  const proposal = getProposal()!;
  assert.equal(proposal.ok, true);
  assert.equal(proposal.changes.length, 2);
  assert.equal(proposal.changes[0].employeeId, target.employeeId, "names are resolved to ids");

  // A proposal naming an uncertified person is rejected by the rules, not by the model.
  const bad = (await run("propose_changes", {
    summary: "Put the new hire on food",
    changes: [
      { action: "remove", employee: names.get(target.employeeId), ...at },
      { action: "add", employee: "Wren", ...at },
    ],
  })) as { allowed: boolean; ruleViolations: string[] };
  assert.equal(bad.allowed, false);
  assert.ok(bad.ruleViolations.length > 0);
  assert.equal(getProposal()!.ok, false);
  assert.ok("allowed" in ((await run("propose_changes", { summary: "x", changes: [{ action: "add", employee: "Ghost", ...at }] })) as object));

  // Commit: a stale or invalid proposal writes nothing (atomic).
  const rows = () => JSON.stringify(db.select().from(assignments).all());
  const snapshot = rows();
  const rejected = commitChanges([
    { action: "remove", employeeId: target.employeeId, ...at },
    { action: "add", employeeId: "wren", ...at },
  ]);
  assert.equal(rejected.ok, false);
  assert.equal(rows(), snapshot, "a rejected proposal changes nothing");
  assert.equal(commitChanges("not changes").ok, false);

  // Commit the legal swap: rows change, both people are told, and the schedule stays valid.
  const replacementId = input.employees.find((e) => e.name === replacement)!.id;
  const applied = commitChanges(proposal.changes);
  assert.equal(applied.ok, true);
  const after = store.loadScheduleInput();
  const now = store.loadActiveAssignments(after);
  assert.ok(!now.some((a) => a.shiftId === target.shiftId && a.employeeId === target.employeeId && a.station === target.station));
  assert.ok(now.some((a) => a.shiftId === target.shiftId && a.employeeId === replacementId && a.station === target.station && a.role === "anchor"));
  assert.deepEqual(validateSchedule(after, now), [], "the schedule is fully valid after the swap");
  const told = (id: string) => db.select().from(messages).where(eq(messages.employeeId, id)).all().filter((m) => m.kind === "schedule-change");
  assert.equal(told(target.employeeId).length, 1);
  assert.equal(told(replacementId).length, 1);

  // Applying the same (now stale) proposal again is rejected.
  assert.equal(commitChanges(proposal.changes).ok, false, "a stale proposal cannot be applied twice");

  console.info("Agent tool checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
