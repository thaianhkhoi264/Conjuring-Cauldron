import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { assignments, availability, employees, mastery, shifts } from "@/lib/db/schema";
import type { StationRequirements } from "@/lib/db/types";
import { currentDemoTime } from "@/lib/mastery";
import { getActivePreferences } from "@/lib/preferences";
import { SLOT_HOURS } from "@/lib/slots";
import { generateSchedule } from "./engine";
import { buildScheduleInput } from "./input";
import { describePreference } from "./preference";
import { validateSchedule } from "./rules";
import { inWindow, missingShifts, planningWindow } from "./weeks";
import type { EngineAssignment, ScheduleInput, ScheduleResult } from "./types";

/** The 7 days after the demo "today". Shifts, hours and schedules are all scoped to it. */
export function currentWindow() {
  return planningWindow(currentDemoTime());
}

/** Make sure shifts exist through the end of the planning window (the week rolls forward with the demo clock). */
export function ensureUpcomingShifts() {
  const window = currentWindow();
  const existing = db.select({ date: shifts.date }).from(shifts).all().map((s) => s.date);
  const missing = missingShifts(existing, window.to);
  if (missing.length) db.insert(shifts).values(missing).onConflictDoNothing().run();
}

/** Load staff, skills, availability and the shifts in the planning window. */
export function loadScheduleInput(): ScheduleInput {
  ensureUpcomingShifts();
  const window = currentWindow();
  return buildScheduleInput({
    employees: db.select().from(employees).all(),
    mastery: db.select().from(mastery).all(),
    availability: db.select().from(availability).all(),
    shifts: db.select().from(shifts).all().filter((s) => inWindow(s.date, window)),
    preferences: getActivePreferences(),
  });
}

/** Saved assignments that still count (not called off or replaced) for the shifts in `input`. */
export function loadActiveAssignments(input: ScheduleInput): EngineAssignment[] {
  const shiftIds = new Set(input.shifts.map((s) => s.id));
  return db
    .select()
    .from(assignments)
    .where(eq(assignments.status, "scheduled"))
    .all()
    .filter((a) => shiftIds.has(a.shiftId))
    .map((a) => ({ shiftId: a.shiftId, employeeId: a.employeeId, station: a.station, role: a.role }));
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
  ensureUpcomingShifts();
  const window = currentWindow();
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
    .filter((s) => inWindow(s.date, window))
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

export type SkillMatrixRow = {
  id: string;
  name: string;
  isNew: boolean;
  hoursCap: number;
  hoursScheduled: number;
  /** null = not started */
  skills: Record<"food" | "drink" | "cs", number | null>;
  /** Shifts worked per station (a shadow shift counts half). */
  experience: Record<"food" | "drink" | "cs", number>;
  /** Accepted shift preferences in words ("No preferences" when none). */
  preference: string;
};

/** Staff with their mastery per station and scheduled hours, for the manager's team view. */
export function getSkillMatrix(): SkillMatrixRow[] {
  const staff = db.select().from(employees).where(eq(employees.role, "employee")).all();
  const masteryRows = db.select().from(mastery).all();
  const preferences = getActivePreferences();
  const hours = new Map<string, number>();
  const window = currentWindow();
  const inWindowIds = new Set(db.select().from(shifts).all().filter((s) => inWindow(s.date, window)).map((s) => s.id));
  for (const a of db.select().from(assignments).all()) {
    if (a.status !== "scheduled" || !inWindowIds.has(a.shiftId)) continue;
    hours.set(a.employeeId, (hours.get(a.employeeId) ?? 0) + SLOT_HOURS);
  }
  return staff
    .map((e) => {
      const skills: SkillMatrixRow["skills"] = { food: null, drink: null, cs: null };
      const experience: SkillMatrixRow["experience"] = { food: 0, drink: 0, cs: 0 };
      for (const m of masteryRows) {
        if (m.employeeId !== e.id) continue;
        skills[m.station] = m.score;
        experience[m.station] = m.experience;
      }
      return {
        id: e.id,
        name: e.name,
        isNew: e.isNew,
        hoursCap: e.hoursCapWeekly,
        hoursScheduled: hours.get(e.id) ?? 0,
        skills,
        experience,
        preference: describePreference(preferences.get(e.id)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ScheduleHealth = {
  /** Hard-rule problems in the saved schedule (for example someone is no longer certified). */
  issues: string[];
  /** Required anchor slots with nobody assigned. */
  gaps: number;
  hasSchedule: boolean;
};

/** Check the saved schedule against today's skills and availability. */
export function getScheduleHealth(): ScheduleHealth {
  const input = loadScheduleInput();
  const active = loadActiveAssignments(input);
  const violations = validateSchedule(input, active);
  return {
    hasSchedule: active.length > 0,
    gaps: violations.filter((v) => v.rule === "coverage").length,
    issues: violations.filter((v) => v.rule !== "coverage").map((v) => v.message),
  };
}
