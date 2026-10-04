import { dayLabel } from "./format";
import { validateSchedule } from "./rules";
import {
  STATIONS,
  type AssignmentRole,
  type EngineAssignment,
  type ScheduleInput,
  type ShiftSlot,
  type Station,
  type Violation,
} from "./types";

/**
 * Manager-requested edits to the saved schedule. The AI assistant can only
 * *propose* these; they are applied by `commitChanges` after `previewChanges`
 * has re-checked every hard rule, so a model can never store an invalid schedule.
 */

export type ScheduleChange = {
  action: "add" | "remove";
  employeeId: string;
  date: string;
  slot: ShiftSlot;
  station: Station;
  role?: AssignmentRole;
};

export type ChangePreview = {
  ok: boolean;
  /** Problems with the request itself (unknown person, nothing to remove...). */
  errors: string[];
  /** New hard-rule violations the change would cause (existing ones are ignored). */
  violations: string[];
  /** Station slots that would be left without an anchor because of this change. */
  newGaps: string[];
  /** One plain-English line per change. */
  lines: string[];
  after: EngineAssignment[];
  changes: ScheduleChange[];
};

const SLOTS: ShiftSlot[] = ["open", "mid", "close"];
const STATION_NAME: Record<Station, string> = { food: "Food", drink: "Drinks", cs: "Register" };

export function shiftIdFor(date: string, slot: string) {
  return `shift-${date}-${slot}`;
}

function sameAssignment(a: EngineAssignment, shiftId: string, employeeId: string, station: Station) {
  return a.shiftId === shiftId && a.employeeId === employeeId && a.station === station;
}

/** Violations as comparable keys, so we can tell which are new. */
function keyOf(v: Violation) {
  return `${v.rule}|${v.employeeId ?? ""}|${v.shiftId ?? ""}|${v.message}`;
}

function parseChange(raw: unknown): ScheduleChange | string {
  if (!raw || typeof raw !== "object") return "A change must be an object.";
  const { action, employeeId, date, slot, station, role } = raw as Record<string, unknown>;
  if (action !== "add" && action !== "remove") return "Each change needs action add or remove.";
  if (typeof employeeId !== "string" || !employeeId) return "Each change needs an employee.";
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Each change needs a date as YYYY-MM-DD.";
  if (typeof slot !== "string" || !SLOTS.includes(slot as ShiftSlot)) return "Each change needs a slot: open, mid or close.";
  if (typeof station !== "string" || !STATIONS.includes(station as Station)) return "Each change needs a station: food, drink or cs.";
  if (role !== undefined && role !== "anchor" && role !== "shadow") return "Role must be anchor or shadow.";
  return { action, employeeId, date, slot: slot as ShiftSlot, station: station as Station, role: role as AssignmentRole | undefined };
}

/**
 * Apply `rawChanges` to a copy of the current schedule and report what would happen.
 * `ok` is true only when the request is well formed and introduces no new hard-rule violation.
 * Leaving an anchor slot empty is allowed (it is reported in `newGaps`) so a manager can free
 * someone up and cover the slot later.
 */
export function previewChanges(input: ScheduleInput, current: EngineAssignment[], rawChanges: unknown): ChangePreview {
  const errors: string[] = [];
  const parsed: ScheduleChange[] = [];

  if (!Array.isArray(rawChanges) || rawChanges.length === 0) errors.push("There are no changes to apply.");
  else if (rawChanges.length > 12) errors.push("Please change at most 12 assignments at a time.");
  else {
    for (const raw of rawChanges) {
      const change = parseChange(raw);
      if (typeof change === "string") errors.push(change);
      else parsed.push(change);
    }
  }

  const names = new Map(input.employees.map((e) => [e.id, e.name]));
  const shiftIds = new Set(input.shifts.map((s) => s.id));
  const after = current.map((a) => ({ ...a }));
  const lines: string[] = [];

  for (const change of errors.length ? [] : parsed) {
    const name = names.get(change.employeeId);
    const shiftId = shiftIdFor(change.date, change.slot);
    const where = `${dayLabel(change.date)} ${change.slot} (${STATION_NAME[change.station]})`;
    if (!name) {
      errors.push(`Unknown employee "${change.employeeId}".`);
      continue;
    }
    if (!shiftIds.has(shiftId)) {
      errors.push(`There is no shift on ${change.date} ${change.slot} in the current planning week.`);
      continue;
    }
    if (change.action === "remove") {
      const index = after.findIndex((a) => sameAssignment(a, shiftId, change.employeeId, change.station));
      if (index < 0) {
        errors.push(`${name} is not scheduled for ${where}.`);
        continue;
      }
      const [removed] = after.splice(index, 1);
      change.role = removed.role;
      lines.push(`Remove ${name} from ${where}.`);
    } else {
      if (after.some((a) => a.shiftId === shiftId && a.employeeId === change.employeeId)) {
        errors.push(`${name} already works ${dayLabel(change.date)} ${change.slot}.`);
        continue;
      }
      const role = change.role ?? "anchor";
      after.push({ shiftId, employeeId: change.employeeId, station: change.station, role });
      change.role = role;
      lines.push(`Add ${name} to ${where}${role === "shadow" ? " as a shadow" : ""}.`);
    }
  }

  if (errors.length) {
    return { ok: false, errors, violations: [], newGaps: [], lines, after: current, changes: parsed };
  }

  const beforeViolations = validateSchedule(input, current);
  const afterViolations = validateSchedule(input, after);
  const existing = new Set(beforeViolations.map(keyOf));
  const added = afterViolations.filter((v) => !existing.has(keyOf(v)));

  return {
    ok: added.every((v) => v.rule === "coverage"),
    errors,
    violations: added.filter((v) => v.rule !== "coverage").map((v) => v.message),
    newGaps: added.filter((v) => v.rule === "coverage").map((v) => v.message),
    lines,
    after,
    changes: parsed,
  };
}
