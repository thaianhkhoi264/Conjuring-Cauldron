import type { availability, employees, mastery, shifts } from "@/lib/db/schema";
import type { StationRequirements } from "@/lib/db/types";
import type { EngineEmployee, EngineShift, ScheduleInput } from "./types";

type EmployeeRow = typeof employees.$inferSelect;
type MasteryRow = typeof mastery.$inferSelect;
type AvailabilityRow = typeof availability.$inferSelect;
type ShiftRow = typeof shifts.$inferSelect;

export type ScheduleRows = {
  employees: Pick<EmployeeRow, "id" | "name" | "role" | "isNew" | "hoursCapWeekly">[];
  mastery: Pick<MasteryRow, "employeeId" | "station" | "score">[];
  availability: Pick<AvailabilityRow, "employeeId" | "dayOfWeek" | "startTime" | "endTime">[];
  shifts: Pick<ShiftRow, "id" | "date" | "slot" | "requiredJson">[];
};

/** Pure mapping from table rows to the engine input (staff only, no managers). */
export function buildScheduleInput(rows: ScheduleRows): ScheduleInput {
  const engineEmployees: EngineEmployee[] = rows.employees
    .filter((e) => e.role === "employee")
    .map((e) => {
      const skills = { food: 0, drink: 0, cs: 0 };
      for (const row of rows.mastery) if (row.employeeId === e.id) skills[row.station] = row.score;
      return {
        id: e.id,
        name: e.name,
        isNew: e.isNew,
        hoursCap: e.hoursCapWeekly,
        skills,
        availability: rows.availability
          .filter((a) => a.employeeId === e.id)
          .map((a) => ({ day: a.dayOfWeek, start: a.startTime, end: a.endTime })),
      };
    });

  const engineShifts: EngineShift[] = rows.shifts.map((s) => {
    const required = JSON.parse(s.requiredJson) as StationRequirements;
    return {
      id: s.id,
      date: s.date,
      slot: s.slot,
      required: { food: required.food ?? 0, drink: required.drink ?? 0, cs: required.cs ?? 0 },
    };
  });

  return { employees: engineEmployees, shifts: engineShifts };
}
