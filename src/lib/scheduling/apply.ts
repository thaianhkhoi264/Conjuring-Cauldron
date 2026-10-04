import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { assignments, messages } from "@/lib/db/schema";
import { currentDemoTime } from "@/lib/mastery";
import { previewChanges, shiftIdFor, type ChangePreview, type ScheduleChange } from "./changes";
import { dayLabel } from "./format";
import { loadActiveAssignments, loadScheduleInput } from "./store";

const STATION_NAME = { food: "Food", drink: "Drinks", cs: "Register" } as const;

/** Preview against the live schedule (no writes). */
export function previewAgainstSaved(rawChanges: unknown): ChangePreview {
  const input = loadScheduleInput();
  return previewChanges(input, loadActiveAssignments(input), rawChanges);
}

export type CommitResult =
  | { ok: true; lines: string[]; newGaps: string[] }
  | { ok: false; errors: string[] };

/**
 * Apply manager-approved changes. Validation is repeated here against the saved schedule, so
 * a proposal that went stale (or was edited on its way from the browser) is rejected.
 * All writes happen in one transaction, and affected employees are told.
 */
export function commitChanges(rawChanges: unknown): CommitResult {
  const preview = previewAgainstSaved(rawChanges);
  if (!preview.ok) return { ok: false, errors: [...preview.errors, ...preview.violations] };

  const createdAt = currentDemoTime();
  db.transaction((tx) => {
    for (const change of preview.changes) {
      const shiftId = shiftIdFor(change.date, change.slot);
      const where = `${dayLabel(change.date)} ${change.slot} (${STATION_NAME[change.station]})`;
      applyOne(tx, change, shiftId);
      tx.insert(messages)
        .values({
          id: randomUUID(),
          employeeId: change.employeeId,
          kind: "schedule-change",
          body:
            change.action === "add"
              ? `Your manager added you to ${where}${change.role === "shadow" ? " as a shadow" : ""}.`
              : `Your manager removed you from ${where}.`,
          read: false,
          createdAt,
        })
        .run();
    }
  });
  return { ok: true, lines: preview.lines, newGaps: preview.newGaps };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function applyOne(tx: Tx, change: ScheduleChange, shiftId: string) {
  if (change.action === "remove") {
    tx.delete(assignments)
      .where(
        and(
          eq(assignments.shiftId, shiftId),
          eq(assignments.employeeId, change.employeeId),
          eq(assignments.station, change.station),
          eq(assignments.status, "scheduled"),
        ),
      )
      .run();
    return;
  }
  tx.insert(assignments)
    .values({
      id: `asg-${shiftId}-${change.station}-${change.role ?? "anchor"}-${change.employeeId}-${randomUUID().slice(0, 6)}`,
      shiftId,
      employeeId: change.employeeId,
      station: change.station,
      role: change.role ?? "anchor",
      status: "scheduled",
    })
    .run();
}
