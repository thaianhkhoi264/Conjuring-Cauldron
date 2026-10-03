import type { AssignmentRole, ShiftSlot, Station } from "@/lib/db/types";

export type { AssignmentRole, ShiftSlot, Station };

export const STATIONS: Station[] = ["food", "drink", "cs"];
export const CERTIFICATION_THRESHOLD = 0.8;
/** An employee may work at most this many shifts in one day. */
export const MAX_SHIFTS_PER_DAY = 2;
/** Shadows (trainees) allowed on one shift, and at most one per anchor at the same station. */
export const MAX_SHADOWS_PER_SHIFT = 2;

export type EngineAvailability = { day: number; start: string; end: string };

export type EngineEmployee = {
  id: string;
  name: string;
  isNew: boolean;
  hoursCap: number;
  skills: Record<Station, number>;
  availability: EngineAvailability[];
};

export type EngineShift = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  slot: ShiftSlot;
  required: Record<Station, number>;
};

export type ScheduleInput = {
  employees: EngineEmployee[];
  shifts: EngineShift[];
  certThreshold?: number;
};

export type EngineAssignment = {
  shiftId: string;
  employeeId: string;
  station: Station;
  role: AssignmentRole;
};

export type RuleName =
  | "unknown-employee"
  | "unknown-shift"
  | "availability"
  | "hours-cap"
  | "double-booked"
  | "daily-limit"
  | "anchor-not-certified"
  | "shadow-not-eligible"
  | "shadow-without-anchor"
  | "shadow-limit"
  | "coverage";

export type Violation = { rule: RuleName; message: string; shiftId?: string; employeeId?: string };

export type Demand = { shiftId: string; station: Station };

export type AssignmentNote = EngineAssignment & { note: string };

export type ScheduleResult = {
  assignments: AssignmentNote[];
  /** Anchor slots the engine could not fill without breaking a hard rule. */
  unfilled: Demand[];
  /** Soft-rule problems, such as stacked specialists. Not violations. */
  warnings: string[];
  stats: {
    anchorsRequired: number;
    anchorsFilled: number;
    shadows: number;
    hoursByEmployee: Record<string, number>;
  };
};
