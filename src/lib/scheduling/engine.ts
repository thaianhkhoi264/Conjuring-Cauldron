import { SLOT_HOURS } from "@/lib/slots";
import {
  canShadow,
  isAvailable,
  isCertified,
  specialty,
  thresholdOf,
  validateSchedule,
} from "./rules";
import {
  MAX_SHADOWS_PER_SHIFT,
  MAX_SHIFTS_PER_DAY,
  STATIONS,
  type AssignmentNote,
  type Demand,
  type EngineAssignment,
  type EngineEmployee,
  type EngineShift,
  type ScheduleInput,
  type ScheduleResult,
  type Station,
} from "./types";

/**
 * Deterministic schedule generator.
 *
 * 1. Anchors: fill every required station slot with a certified employee,
 *    most-constrained slot first, choosing by fairness, skill and specialty spread.
 * 2. Repair: if a slot has no candidate, try moving one existing assignment.
 * 3. Shadows: place new hires on stations they are still learning, beside an anchor.
 *
 * It never breaks a hard rule (see rules.ts). If coverage is impossible the slot
 * is returned in `unfilled` rather than filled illegally.
 */

// Soft-score weights. Higher score = better candidate.
const W_FAIRNESS = 3; // prefer people with fewer hours relative to their cap
const W_SKILL = 1; // prefer the better performer at the station
const P_OVERLOAD = 4; // discourage filling anyone past 80% of their cap, so call-offs can be covered
const SLACK_RATIO = 0.8;
const P_SHIFT_SPECIALTY = 3; // per other same-specialty employee on the same shift
const P_DAY_SPECIALTY = 1.5; // grows with the square of same-specialty employees that day
const W_SHADOW_MENTOR = 1.5; // prefer pairing a shadow with a strong anchor
const W_SHADOW_PROGRESS = 1; // prefer shadowing where the trainee is closest to certifying

class State {
  readonly assignments: EngineAssignment[] = [];
  private hours = new Map<string, number>();
  private byShift = new Map<string, EngineAssignment[]>();
  private byDay = new Map<string, EngineAssignment[]>(); // date|employee
  private byEmployee = new Map<string, EngineAssignment[]>();

  constructor(readonly shiftById: Map<string, EngineShift>) {}

  hoursOf(employeeId: string) {
    return this.hours.get(employeeId) ?? 0;
  }

  onShift(shiftId: string) {
    return this.byShift.get(shiftId) ?? [];
  }

  assignmentsOf(employeeId: string) {
    return this.byEmployee.get(employeeId) ?? [];
  }

  onDay(date: string, employeeId: string) {
    return this.byDay.get(`${date}|${employeeId}`) ?? [];
  }

  add(a: EngineAssignment) {
    const shift = this.shiftById.get(a.shiftId)!;
    this.assignments.push(a);
    this.hours.set(a.employeeId, this.hoursOf(a.employeeId) + SLOT_HOURS);
    push(this.byShift, a.shiftId, a);
    push(this.byDay, `${shift.date}|${a.employeeId}`, a);
    push(this.byEmployee, a.employeeId, a);
  }

  remove(a: EngineAssignment) {
    const shift = this.shiftById.get(a.shiftId)!;
    this.assignments.splice(this.assignments.indexOf(a), 1);
    this.hours.set(a.employeeId, this.hoursOf(a.employeeId) - SLOT_HOURS);
    drop(this.byShift, a.shiftId, a);
    drop(this.byDay, `${shift.date}|${a.employeeId}`, a);
    drop(this.byEmployee, a.employeeId, a);
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function drop<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (!list) return;
  list.splice(list.indexOf(value), 1);
}

type Context = {
  employees: EngineEmployee[];
  employeeById: Map<string, EngineEmployee>;
  threshold: number;
  state: State;
};

/** Hard-rule check for adding `employee` to `shift` (any station). */
function canWork(ctx: Context, employee: EngineEmployee, shift: EngineShift) {
  const { state } = ctx;
  if (!isAvailable(employee, shift)) return false;
  if (state.onShift(shift.id).some((a) => a.employeeId === employee.id)) return false;
  if (state.hoursOf(employee.id) + SLOT_HOURS > employee.hoursCap) return false;
  if (state.onDay(shift.date, employee.id).length >= MAX_SHIFTS_PER_DAY) return false;
  return true;
}

function anchorCandidates(ctx: Context, demand: Demand) {
  const shift = ctx.state.shiftById.get(demand.shiftId)!;
  return ctx.employees.filter(
    (e) => isCertified(e, demand.station, ctx.threshold) && canWork(ctx, e, shift),
  );
}

/** How many other same-specialty employees already work this shift / this day. */
function specialtyCounts(ctx: Context, employee: EngineEmployee, shift: EngineShift) {
  const own = specialty(employee, ctx.threshold);
  if (!own) return { shift: 0, day: 0 };
  const sameShift = new Set<string>();
  const sameDay = new Set<string>();
  for (const a of ctx.state.assignments) {
    if (a.employeeId === employee.id) continue;
    const other = ctx.employeeById.get(a.employeeId)!;
    if (specialty(other, ctx.threshold) !== own) continue;
    const otherShift = ctx.state.shiftById.get(a.shiftId)!;
    if (otherShift.date !== shift.date) continue;
    sameDay.add(a.employeeId);
    if (a.shiftId === shift.id) sameShift.add(a.employeeId);
  }
  return { shift: sameShift.size, day: sameDay.size };
}

function anchorScore(ctx: Context, employee: EngineEmployee, demand: Demand) {
  const shift = ctx.state.shiftById.get(demand.shiftId)!;
  const ratioAfter = (ctx.state.hoursOf(employee.id) + SLOT_HOURS) / employee.hoursCap;
  const counts = specialtyCounts(ctx, employee, shift);
  return (
    W_FAIRNESS * (1 - ratioAfter) +
    W_SKILL * employee.skills[demand.station] -
    P_OVERLOAD * Math.max(0, ratioAfter - SLACK_RATIO) -
    P_SHIFT_SPECIALTY * counts.shift -
    P_DAY_SPECIALTY * counts.day * counts.day
  );
}

function bestCandidate(ctx: Context, demand: Demand, pool?: EngineEmployee[]) {
  const candidates = pool ?? anchorCandidates(ctx, demand);
  let best: EngineEmployee | undefined;
  let bestScore = -Infinity;
  for (const e of candidates) {
    const score = anchorScore(ctx, e, demand);
    if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function anchorNote(ctx: Context, e: EngineEmployee, station: Station) {
  const hours = ctx.state.hoursOf(e.id);
  return `Anchor: ${station} skill ${Math.round(e.skills[station] * 100)}%, ${hours}/${e.hoursCap}h.`;
}

function place(ctx: Context, employee: EngineEmployee, demand: Demand, notes: Map<EngineAssignment, string>) {
  const assignment: EngineAssignment = {
    shiftId: demand.shiftId,
    employeeId: employee.id,
    station: demand.station,
    role: "anchor",
  };
  ctx.state.add(assignment);
  notes.set(assignment, anchorNote(ctx, employee, demand.station));
  return assignment;
}

/**
 * One-step repair: free `employee` by removing an assignment that blocks them from
 * `demand`, then check the freed demand can be covered by someone else.
 */
function tryRepair(ctx: Context, demand: Demand, notes: Map<EngineAssignment, string>) {
  const { state } = ctx;
  const shift = state.shiftById.get(demand.shiftId)!;

  const candidates = ctx.employees.filter(
    (e) => isCertified(e, demand.station, ctx.threshold) && isAvailable(e, shift),
  );

  for (const employee of candidates) {
    const blockers = state.assignmentsOf(employee.id).filter((blocker) => {
      if (blocker.role !== "anchor") return false;
      const blockerShift = state.shiftById.get(blocker.shiftId)!;
      return (
        blocker.shiftId === shift.id ||
        blockerShift.date === shift.date ||
        state.hoursOf(employee.id) + SLOT_HOURS > employee.hoursCap
      );
    });

    for (const blocker of blockers) {
      const freed: Demand = { shiftId: blocker.shiftId, station: blocker.station };
      const oldNote = notes.get(blocker);
      state.remove(blocker);
      notes.delete(blocker);

      if (canWork(ctx, employee, shift)) {
        // Somebody else (not this employee) must be able to cover the slot we just freed.
        const replacement = bestCandidate(ctx, freed, anchorCandidates(ctx, freed).filter((e) => e.id !== employee.id));
        if (replacement) {
          place(ctx, employee, demand, notes);
          place(ctx, replacement, freed, notes);
          return true;
        }
      }

      // Roll back.
      state.add(blocker);
      if (oldNote) notes.set(blocker, oldNote);
    }
  }
  return false;
}

function fillAnchors(ctx: Context, shifts: EngineShift[], notes: Map<EngineAssignment, string>) {
  const pending: Demand[] = [];
  for (const shift of shifts) {
    for (const station of STATIONS) {
      for (let i = 0; i < shift.required[station]; i++) pending.push({ shiftId: shift.id, station });
    }
  }
  const unfilled: Demand[] = [];

  while (pending.length) {
    // Most-constrained-first: fewest eligible candidates now; ties by date, slot order, station.
    let pickIndex = 0;
    let pickCount = Infinity;
    for (let i = 0; i < pending.length; i++) {
      const count = anchorCandidates(ctx, pending[i]).length;
      if (count < pickCount) {
        pickCount = count;
        pickIndex = i;
      }
    }
    const [demand] = pending.splice(pickIndex, 1);
    const best = bestCandidate(ctx, demand);
    if (best) {
      place(ctx, best, demand, notes);
    } else if (!tryRepair(ctx, demand, notes)) {
      unfilled.push(demand);
    }
  }
  return unfilled;
}

function fillShadows(ctx: Context, shifts: EngineShift[], notes: Map<EngineAssignment, string>) {
  const { state } = ctx;
  const trainees = ctx.employees.filter((e) => e.isNew);

  for (const shift of shifts) {
    for (const station of STATIONS) {
      const anchors = state.onShift(shift.id).filter((a) => a.station === station && a.role === "anchor");
      if (anchors.length === 0) continue;

      for (let slot = 0; slot < anchors.length; slot++) {
        const shadowsOnShift = state.onShift(shift.id).filter((a) => a.role === "shadow").length;
        if (shadowsOnShift >= MAX_SHADOWS_PER_SHIFT) break;
        const shadowsHere = state.onShift(shift.id).filter((a) => a.role === "shadow" && a.station === station).length;
        if (shadowsHere >= anchors.length) break;

        const mentor = Math.max(...anchors.map((a) => ctx.employeeById.get(a.employeeId)!.skills[station]));
        let best: EngineEmployee | undefined;
        let bestScore = -Infinity;
        for (const t of trainees) {
          if (!canShadow(t, station, ctx.threshold) || !canWork(ctx, t, shift)) continue;
          const ratioAfter = (state.hoursOf(t.id) + SLOT_HOURS) / t.hoursCap;
          const score =
            W_FAIRNESS * (1 - ratioAfter) + W_SHADOW_PROGRESS * t.skills[station] + W_SHADOW_MENTOR * mentor;
          if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && best && t.id < best.id)) {
            best = t;
            bestScore = score;
          }
        }
        if (!best) break;
        const shadow: EngineAssignment = { shiftId: shift.id, employeeId: best.id, station, role: "shadow" };
        state.add(shadow);
        notes.set(
          shadow,
          `Shadow: learning ${station} (${Math.round(best.skills[station] * 100)}%, needs ${Math.round(ctx.threshold * 100)}%), paired with a ${Math.round(mentor * 100)}% anchor.`,
        );
      }
    }
  }
}

function collectWarnings(ctx: Context) {
  const warnings: string[] = [];
  const byDay = new Map<string, Map<Station, Set<string>>>();
  for (const a of ctx.state.assignments) {
    const e = ctx.employeeById.get(a.employeeId)!;
    const spec = specialty(e, ctx.threshold);
    if (!spec) continue;
    const date = ctx.state.shiftById.get(a.shiftId)!.date;
    const stations = byDay.get(date) ?? new Map<Station, Set<string>>();
    const people = stations.get(spec) ?? new Set<string>();
    people.add(e.name);
    stations.set(spec, people);
    byDay.set(date, stations);
  }
  for (const [date, stations] of byDay) {
    for (const [station, people] of stations) {
      if (people.size >= 3) {
        warnings.push(`${date}: ${people.size} ${station}-only specialists are scheduled (${[...people].join(", ")}).`);
      }
    }
  }
  return warnings;
}

export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const threshold = thresholdOf(input);
  const employees = [...input.employees].sort((a, b) => a.id.localeCompare(b.id));
  const shifts = [...input.shifts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const state = new State(new Map(shifts.map((s) => [s.id, s])));
  const ctx: Context = {
    employees,
    employeeById: new Map(employees.map((e) => [e.id, e])),
    threshold,
    state,
  };
  const notes = new Map<EngineAssignment, string>();

  const unfilled = fillAnchors(ctx, shifts, notes);
  fillShadows(ctx, shifts, notes);

  const assignments: AssignmentNote[] = state.assignments
    .map((a) => ({ ...a, note: notes.get(a) ?? "" }))
    .sort((a, b) => a.shiftId.localeCompare(b.shiftId) || a.station.localeCompare(b.station) || a.role.localeCompare(b.role));

  const hoursByEmployee: Record<string, number> = {};
  for (const e of employees) hoursByEmployee[e.id] = state.hoursOf(e.id);
  const anchorsRequired = shifts.reduce((n, s) => n + STATIONS.reduce((m, st) => m + s.required[st], 0), 0);

  // Safety net: whatever we produce must pass the validator, apart from slots reported as unfilled.
  const unexpected = validateSchedule(input, assignments).filter((v) => v.rule !== "coverage");
  if (unexpected.length) {
    throw new Error(`Scheduler produced an invalid schedule: ${unexpected.map((v) => v.message).join(" ")}`);
  }

  return {
    assignments,
    unfilled,
    warnings: collectWarnings(ctx),
    stats: {
      anchorsRequired,
      anchorsFilled: anchorsRequired - unfilled.length,
      shadows: assignments.filter((a) => a.role === "shadow").length,
      hoursByEmployee,
    },
  };
}

export type ReplacementCandidate = {
  employeeId: string;
  name: string;
  score: number;
  hoursAfter: number;
  hoursCap: number;
  reasons: string[];
};

export type RankReplacementsOptions = {
  /** Employees who must not be offered the shift (for example those who already declined). */
  exclude?: string[];
  limit?: number;
};

/**
 * Rank who could cover an anchor slot that has just opened up.
 *
 * `assignments` must be the schedule WITHOUT the vacated assignment (and without any
 * other called-off ones). Only employees who satisfy every hard rule are returned:
 * certified for the station, available for the whole slot, free on that shift, under
 * their hours cap and daily limit. Order follows the same soft scoring as the generator
 * (fairness, skill, specialty spread, slack).
 */
export function rankReplacements(
  input: ScheduleInput,
  assignments: EngineAssignment[],
  vacated: Demand,
  options: RankReplacementsOptions = {},
): ReplacementCandidate[] {
  const threshold = thresholdOf(input);
  const employees = [...input.employees].sort((a, b) => a.id.localeCompare(b.id));
  const shifts = [...input.shifts];
  const state = new State(new Map(shifts.map((s) => [s.id, s])));
  for (const a of assignments) {
    if (state.shiftById.has(a.shiftId)) state.add({ ...a });
  }
  const ctx: Context = {
    employees,
    employeeById: new Map(employees.map((e) => [e.id, e])),
    threshold,
    state,
  };
  const shift = state.shiftById.get(vacated.shiftId);
  if (!shift) return [];

  const excluded = new Set(options.exclude ?? []);
  const scored = anchorCandidates(ctx, vacated)
    .filter((e) => !excluded.has(e.id))
    .map((e) => ({ employee: e, score: anchorScore(ctx, e, vacated) }))
    .sort((a, b) => b.score - a.score || a.employee.id.localeCompare(b.employee.id));

  const result: ReplacementCandidate[] = scored.slice(0, options.limit ?? 3).map(({ employee, score }) => {
    const hoursNow = state.hoursOf(employee.id);
    const hoursAfter = hoursNow + SLOT_HOURS;
    const counts = specialtyCounts(ctx, employee, shift);
    const reasons = [
      `Certified for ${vacated.station} (${Math.round(employee.skills[vacated.station] * 100)}%).`,
      `Available for the whole shift.`,
      `${hoursAfter}/${employee.hoursCap}h this week with this shift (${Math.round((hoursAfter / employee.hoursCap) * 100)}% of cap).`,
    ];
    if (hoursAfter / employee.hoursCap > SLACK_RATIO) reasons.push("Close to their weekly cap.");
    if (counts.shift + counts.day === 0 && specialty(employee, threshold)) reasons.push("Does not stack another specialist that day.");
    if (counts.shift > 0) reasons.push("Another specialist with the same skill is on this shift.");
    return { employeeId: employee.id, name: employee.name, score: Math.round(score * 100) / 100, hoursAfter, hoursCap: employee.hoursCap, reasons };
  });
  return result;
}
