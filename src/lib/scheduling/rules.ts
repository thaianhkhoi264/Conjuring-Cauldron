import { SLOT_HOURS, SLOT_TIMES } from "@/lib/slots";
import {
  CERTIFICATION_THRESHOLD,
  MAX_SHADOWS_PER_SHIFT,
  MAX_SHIFTS_PER_DAY,
  STATIONS,
  type EngineAssignment,
  type EngineEmployee,
  type EngineShift,
  type ScheduleInput,
  type Station,
  type Violation,
} from "./types";

/**
 * Hard scheduling rules. The engine and any AI agent edits go through
 * `validateSchedule`; nothing that breaks these rules may be saved.
 */

export function thresholdOf(input: { certThreshold?: number }) {
  return input.certThreshold ?? CERTIFICATION_THRESHOLD;
}

export function dayOfWeek(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
}

export function isCertified(employee: EngineEmployee, station: Station, threshold: number) {
  return employee.skills[station] >= threshold;
}

/** New hires may shadow a station they have started but not yet passed. */
export function canShadow(employee: EngineEmployee, station: Station, threshold: number) {
  const score = employee.skills[station];
  return employee.isNew && score > 0 && score < threshold;
}

export function isAvailable(employee: EngineEmployee, shift: EngineShift) {
  const { start, end } = SLOT_TIMES[shift.slot];
  const day = dayOfWeek(shift.date);
  return employee.availability.some((w) => w.day === day && w.start <= start && w.end >= end);
}

/** The single station an employee is certified in, or null for all-rounders and the uncertified. */
export function specialty(employee: EngineEmployee, threshold: number): Station | null {
  const certified = STATIONS.filter((station) => isCertified(employee, station, threshold));
  return certified.length === 1 ? certified[0] : null;
}

export function validateSchedule(input: ScheduleInput, assignments: EngineAssignment[]): Violation[] {
  const threshold = thresholdOf(input);
  const employees = new Map(input.employees.map((e) => [e.id, e]));
  const shifts = new Map(input.shifts.map((s) => [s.id, s]));
  const violations: Violation[] = [];

  const hours = new Map<string, number>();
  const onShift = new Map<string, number>();
  const perDay = new Map<string, number>();
  const anchors = new Map<string, number>(); // shiftId|station
  const shadows = new Map<string, number>(); // shiftId|station
  const shadowsPerShift = new Map<string, number>();

  for (const a of assignments) {
    const employee = employees.get(a.employeeId);
    const shift = shifts.get(a.shiftId);
    if (!employee) {
      violations.push({ rule: "unknown-employee", message: `Unknown employee ${a.employeeId}.`, employeeId: a.employeeId });
      continue;
    }
    if (!shift) {
      violations.push({ rule: "unknown-shift", message: `Unknown shift ${a.shiftId}.`, shiftId: a.shiftId });
      continue;
    }
    const who = `${employee.name} on ${shift.date} ${shift.slot}`;

    if (!isAvailable(employee, shift)) {
      violations.push({ rule: "availability", message: `${who}: not available.`, shiftId: shift.id, employeeId: employee.id });
    }

    hours.set(employee.id, (hours.get(employee.id) ?? 0) + SLOT_HOURS);
    const shiftKey = `${shift.id}|${employee.id}`;
    onShift.set(shiftKey, (onShift.get(shiftKey) ?? 0) + 1);
    const dayKey = `${shift.date}|${employee.id}`;
    perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);

    const stationKey = `${shift.id}|${a.station}`;
    if (a.role === "anchor") {
      anchors.set(stationKey, (anchors.get(stationKey) ?? 0) + 1);
      if (!isCertified(employee, a.station, threshold)) {
        violations.push({ rule: "anchor-not-certified", message: `${who}: not certified for ${a.station}.`, shiftId: shift.id, employeeId: employee.id });
      }
    } else {
      shadows.set(stationKey, (shadows.get(stationKey) ?? 0) + 1);
      shadowsPerShift.set(shift.id, (shadowsPerShift.get(shift.id) ?? 0) + 1);
      if (!canShadow(employee, a.station, threshold)) {
        violations.push({ rule: "shadow-not-eligible", message: `${who}: cannot shadow ${a.station}.`, shiftId: shift.id, employeeId: employee.id });
      }
    }
  }

  for (const [key, count] of onShift) {
    if (count > 1) {
      const [shiftId, employeeId] = key.split("|");
      violations.push({ rule: "double-booked", message: `${employeeId} is assigned ${count} times on shift ${shiftId}.`, shiftId, employeeId });
    }
  }
  for (const [key, count] of perDay) {
    if (count > MAX_SHIFTS_PER_DAY) {
      const [date, employeeId] = key.split("|");
      violations.push({ rule: "daily-limit", message: `${employeeId} works ${count} shifts on ${date}.`, employeeId });
    }
  }
  for (const [employeeId, total] of hours) {
    const employee = employees.get(employeeId);
    if (employee && total > employee.hoursCap) {
      violations.push({ rule: "hours-cap", message: `${employee.name} is scheduled ${total}h, cap is ${employee.hoursCap}h.`, employeeId });
    }
  }
  for (const [key, count] of shadows) {
    const [shiftId, station] = key.split("|");
    if ((anchors.get(key) ?? 0) === 0) {
      violations.push({ rule: "shadow-without-anchor", message: `Shadow at ${station} on ${shiftId} has no anchor.`, shiftId });
    } else if (count > (anchors.get(key) ?? 0)) {
      violations.push({ rule: "shadow-limit", message: `More shadows than anchors at ${station} on ${shiftId}.`, shiftId });
    }
  }
  for (const [shiftId, count] of shadowsPerShift) {
    if (count > MAX_SHADOWS_PER_SHIFT) {
      violations.push({ rule: "shadow-limit", message: `${count} shadows on shift ${shiftId}; the limit is ${MAX_SHADOWS_PER_SHIFT}.`, shiftId });
    }
  }
  for (const shift of input.shifts) {
    for (const station of STATIONS) {
      const have = anchors.get(`${shift.id}|${station}`) ?? 0;
      if (have < shift.required[station]) {
        violations.push({
          rule: "coverage",
          message: `${shift.date} ${shift.slot} needs ${shift.required[station]} ${station} anchor(s), has ${have}.`,
          shiftId: shift.id,
        });
      }
    }
  }
  return violations;
}
