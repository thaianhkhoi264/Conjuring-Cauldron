import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { assignments, availability, employees, mastery, shifts } from "@/lib/db/schema";
import type { StationRequirements } from "@/lib/db/types";
import { generateSchedule } from "./engine";
import { buildScheduleInput } from "./input";
import type { EngineAssignment, ScheduleInput, ScheduleResult } from "./types";

/** Load staff, skills, availability and open shifts from the database. */
export function loadScheduleInput(): ScheduleInput {
  return buildScheduleInput({
    employees: db.select().from(employees).all(),
    mastery: db.select().from(mastery).all(),
    availability: db.select().from(availability).all(),
    shifts: db.select().from(shifts).all(),
  });
}

/**
 * Replace the saved assignments for the given shifts with `chosen`. Atomic: either
 * the whole new schedule is stored or nothing changes.
 */
export function saveSchedule(shiftIds: string[], chosen: EngineAssignment[]) {
  db.transaction((tx) => {
    if (shiftIds.length) tx.delete(assignments).where(inArray(assignments.shiftId, shiftIds)).run();
    if (chosen.length) {
      tx.insert(assignments)
        .values(
          chosen.map((a) => ({
            id: `asg-${a.shiftId}-${a.station}-${a.role}-${a.employeeId}`,
            shiftId: a.shiftId,
            employeeId: a.employeeId,
            station: a.station,
            role: a.role,
            status: "scheduled" as const,
          })),
        )
        .run();
    }
  });
}

/** Generate a schedule for all seeded shifts and store it. */
export function generateAndSaveSchedule(): ScheduleResult {
  const input = loadScheduleInput();
  const result = generateSchedule(input);
  saveSchedule(input.shifts.map((s) => s.id), result.assignments);
  return result;
}

export type ScheduleViewShift = {
  id: string;
  date: string;
  slot: string;
  required: StationRequirements;
  assignments: { id: string; employeeId: string; employeeName: string; station: string; role: string; status: string }[];
};

/** Saved schedule joined with employee names, grouped by shift. */
export function getScheduleView(): ScheduleViewShift[] {
  const names = new Map(db.select({ id: employees.id, name: employees.name }).from(employees).all().map((e) => [e.id, e.name]));
  const byShift = new Map<string, ScheduleViewShift["assignments"]>();
  for (const a of db.select().from(assignments).all()) {
    const list = byShift.get(a.shiftId) ?? [];
    list.push({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: names.get(a.employeeId) ?? a.employeeId,
      station: a.station,
      role: a.role,
      status: a.status,
    });
    byShift.set(a.shiftId, list);
  }
  const order = { food: 0, drink: 1, cs: 2 } as const;
  return db
    .select()
    .from(shifts)
    .all()
    .sort((a, b) => a.date.localeCompare(b.date) || ["open", "mid", "close"].indexOf(a.slot) - ["open", "mid", "close"].indexOf(b.slot))
    .map((s) => ({
      id: s.id,
      date: s.date,
      slot: s.slot,
      required: JSON.parse(s.requiredJson) as StationRequirements,
      assignments: (byShift.get(s.id) ?? []).sort(
        (a, b) =>
          order[a.station as keyof typeof order] - order[b.station as keyof typeof order] ||
          a.role.localeCompare(b.role),
      ),
    }));
}
