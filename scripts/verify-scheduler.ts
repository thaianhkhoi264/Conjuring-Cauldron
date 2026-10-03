import assert from "node:assert/strict";

import { buildDemoSeed } from "../src/lib/db/seed-data";
import { generateSchedule } from "../src/lib/scheduling/engine";
import { buildScheduleInput } from "../src/lib/scheduling/input";
import { validateSchedule } from "../src/lib/scheduling/rules";
import type {
  EngineEmployee,
  EngineShift,
  ScheduleInput,
  Station,
} from "../src/lib/scheduling/types";

// Pure logic only: this script never touches a database or the network.

const WIDE = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "23:59" }));

function emp(
  id: string,
  skills: Partial<Record<Station, number>>,
  options: Partial<Pick<EngineEmployee, "hoursCap" | "isNew" | "availability">> = {},
): EngineEmployee {
  return {
    id,
    name: id,
    isNew: options.isNew ?? false,
    hoursCap: options.hoursCap ?? 40,
    skills: { food: 0, drink: 0, cs: 0, ...skills },
    availability: options.availability ?? WIDE,
  };
}

function shift(id: string, date: string, slot: EngineShift["slot"], required: Partial<Record<Station, number>>): EngineShift {
  return { id, date, slot, required: { food: 0, drink: 0, cs: 0, ...required } };
}

function rules(input: ScheduleInput, assignments: Parameters<typeof validateSchedule>[1]) {
  return validateSchedule(input, assignments).map((v) => v.rule);
}

// 2026-10-04 is a Sunday.
const SUN = "2026-10-04";
const MON = "2026-10-05";

// 1. Only certified employees become anchors.
{
  const input: ScheduleInput = {
    employees: [emp("cert", { food: 0.9 }), emp("almost", { food: 0.79 })],
    shifts: [shift("s1", SUN, "mid", { food: 1 })],
  };
  const result = generateSchedule(input);
  assert.deepEqual(result.assignments.map((a) => [a.employeeId, a.role]), [["cert", "anchor"]]);
}

// 2. The weekly hours cap is respected (4h shifts: cap 8 means two shifts).
{
  const input: ScheduleInput = {
    employees: [emp("solo", { food: 0.9 }, { hoursCap: 8 })],
    shifts: [
      shift("a", SUN, "open", { food: 1 }),
      shift("b", MON, "open", { food: 1 }),
      shift("c", "2026-10-06", "open", { food: 1 }),
    ],
  };
  const result = generateSchedule(input);
  assert.equal(result.assignments.length, 2);
  assert.equal(result.unfilled.length, 1);
  assert.equal(result.stats.hoursByEmployee.solo, 8);
}

// 3. Availability is respected: Sunday-only worker cannot take Monday.
{
  const input: ScheduleInput = {
    employees: [emp("sunday", { food: 0.9 }, { availability: [{ day: 0, start: "07:00", end: "21:00" }] })],
    shifts: [shift("mon", MON, "mid", { food: 1 })],
  };
  const result = generateSchedule(input);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.unfilled.length, 1);
}

// 4. Availability must cover the whole slot, not just touch it.
{
  const input: ScheduleInput = {
    employees: [emp("late", { food: 0.9 }, { availability: [{ day: 0, start: "12:00", end: "21:00" }] })],
    shifts: [shift("mid", SUN, "mid", { food: 1 })], // mid is 11:00-15:00
  };
  assert.equal(generateSchedule(input).unfilled.length, 1);
}

// 5. One person, one station per shift; no double booking.
{
  const input: ScheduleInput = {
    employees: [emp("both", { food: 0.9, drink: 0.9 })],
    shifts: [shift("s", SUN, "mid", { food: 1, drink: 1 })],
  };
  const result = generateSchedule(input);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.unfilled.length, 1);
}

// 6. At most two shifts per day.
{
  const input: ScheduleInput = {
    employees: [emp("one", { food: 0.9 })],
    shifts: [
      shift("a", SUN, "open", { food: 1 }),
      shift("b", SUN, "mid", { food: 1 }),
      shift("c", SUN, "close", { food: 1 }),
    ],
  };
  const result = generateSchedule(input);
  assert.equal(result.assignments.length, 2);
  assert.equal(result.unfilled.length, 1);
}

// 7. Spread the specialists: with an all-rounder available, no day gets three drink-only people.
{
  const input: ScheduleInput = {
    employees: [
      emp("d1", { drink: 0.9 }),
      emp("d2", { drink: 0.9 }),
      emp("d3", { drink: 0.9 }),
      emp("all", { food: 0.9, drink: 0.9, cs: 0.9 }),
    ],
    shifts: [
      shift("a", SUN, "open", { drink: 1 }),
      shift("b", SUN, "mid", { drink: 1 }),
      shift("c", SUN, "close", { drink: 1 }),
    ],
  };
  const result = generateSchedule(input);
  const people = new Set(result.assignments.map((a) => a.employeeId));
  const specialists = [...people].filter((id) => id.startsWith("d"));
  assert.ok(specialists.length <= 2, `expected at most 2 drink specialists, got ${specialists}`);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.unfilled, []);
}

// 8. New hires shadow beside an anchor, never alone, and never anchor.
{
  const input: ScheduleInput = {
    employees: [emp("mentor", { food: 0.95 }), emp("newbie", { food: 0.5 }, { isNew: true })],
    shifts: [shift("s", SUN, "mid", { food: 1 })],
  };
  const result = generateSchedule(input);
  assert.deepEqual(
    result.assignments.map((a) => [a.employeeId, a.role]).sort(),
    [["mentor", "anchor"], ["newbie", "shadow"]],
  );
}
{
  const input: ScheduleInput = {
    employees: [emp("newbie", { food: 0.5 }, { isNew: true })],
    shifts: [shift("s", SUN, "mid", { food: 1 })],
  };
  const result = generateSchedule(input);
  assert.equal(result.assignments.length, 0, "a shadow with no anchor is never scheduled");
  assert.equal(result.unfilled.length, 1);
}

// 9. A brand-new hire with no training in the station is not scheduled at all.
{
  const input: ScheduleInput = {
    employees: [emp("mentor", { food: 0.95 }), emp("blank", {}, { isNew: true })],
    shifts: [shift("s", SUN, "mid", { food: 1 })],
  };
  assert.deepEqual(generateSchedule(input).assignments.map((a) => a.employeeId), ["mentor"]);
}

// 10. Validator catches each hard-rule violation in a hand-made bad schedule.
{
  const input: ScheduleInput = {
    employees: [
      emp("cert", { food: 0.9 }, { hoursCap: 4 }),
      emp("weak", { food: 0.5 }),
      emp("sunday", { food: 0.9 }, { availability: [{ day: 0, start: "07:00", end: "21:00" }] }),
    ],
    shifts: [shift("s", SUN, "mid", { food: 1 }), shift("t", MON, "mid", { food: 1 })],
  };
  assert.ok(rules(input, [{ shiftId: "s", employeeId: "weak", station: "food", role: "anchor" }]).includes("anchor-not-certified"));
  assert.ok(rules(input, []).includes("coverage"));
  assert.ok(rules(input, [
    { shiftId: "s", employeeId: "cert", station: "food", role: "anchor" },
    { shiftId: "t", employeeId: "cert", station: "food", role: "anchor" },
  ]).includes("hours-cap"));
  assert.ok(rules(input, [{ shiftId: "t", employeeId: "sunday", station: "food", role: "anchor" }]).includes("availability"));
  assert.ok(rules(input, [{ shiftId: "s", employeeId: "weak", station: "food", role: "shadow" }]).includes("shadow-not-eligible"));
  assert.ok(rules(input, [{ shiftId: "zzz", employeeId: "cert", station: "food", role: "anchor" }]).includes("unknown-shift"));
  assert.ok(rules(input, [{ shiftId: "s", employeeId: "ghost", station: "food", role: "anchor" }]).includes("unknown-employee"));
}

// 11. Demo seed: every anchor slot is filled and the result passes the validator.
{
  const seed = buildDemoSeed();
  const input = buildScheduleInput({
    employees: seed.employees as never,
    mastery: seed.mastery as never,
    availability: seed.availability as never,
    shifts: seed.shifts as never,
  });
  const result = generateSchedule(input);
  assert.deepEqual(result.unfilled, [], "seed week must be fully covered");
  assert.equal(result.stats.anchorsFilled, result.stats.anchorsRequired);
  assert.deepEqual(validateSchedule(input, result.assignments), []);
  assert.deepEqual(result.warnings, [], "no day should stack three same-specialty employees");
  assert.ok(result.stats.shadows >= 1, "Wren should be placed as a shadow");
  for (const a of result.assignments) assert.notEqual(a.employeeId, "finch", "untrained Finch is not scheduled");
  assert.ok(!result.assignments.some((a) => a.employeeId === "morgana"), "managers are not scheduled");
  // Determinism: same input, same output.
  assert.deepEqual(generateSchedule(input).assignments, result.assignments);
}

// 12. Randomised stress: the engine never emits an invalid schedule (it throws if it would).
{
  let seed = 12345;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const dates = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"];
  const slots: EngineShift["slot"][] = ["open", "mid", "close"];
  const stations: Station[] = ["food", "drink", "cs"];
  for (let run = 0; run < 200; run++) {
    const employees = Array.from({ length: 3 + Math.floor(random() * 8) }, (_, i) =>
      emp(
        `e${i}`,
        Object.fromEntries(stations.map((s) => [s, random() < 0.5 ? 0.5 + random() * 0.5 : random() * 0.7])),
        {
          hoursCap: 4 * (1 + Math.floor(random() * 8)),
          isNew: random() < 0.3,
          availability: WIDE.filter(() => random() < 0.7),
        },
      ),
    );
    const shifts = dates.flatMap((date) =>
      slots.map((slot) =>
        shift(`${date}-${slot}`, date, slot, {
          food: Math.floor(random() * 3),
          drink: Math.floor(random() * 3),
          cs: Math.floor(random() * 2),
        }),
      ),
    );
    const input = { employees, shifts };
    const result = generateSchedule(input); // throws if any hard rule other than coverage is broken
    // Unfilled slots must equal the anchor shortfall computed independently from the assignments.
    let shortfall = 0;
    for (const sh of shifts) {
      for (const station of stations) {
        const have = result.assignments.filter((a) => a.shiftId === sh.id && a.station === station && a.role === "anchor").length;
        shortfall += Math.max(0, sh.required[station] - have);
      }
    }
    assert.equal(result.unfilled.length, shortfall, `run ${run}: unfilled must match the anchor shortfall`);
  }
}

console.info("Scheduler checks passed.");
