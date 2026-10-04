import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { callSessions } from "@/lib/db/schema";
import type { CorrectionResult } from "./corrections";
import { getVoiceScenario } from "./scenarios";

export type LoggedCorrection = CorrectionResult & { callSessionId: string; scenario: string; when: string };

/** Transcript fixes an employee reported on their practice calls (for the manager), newest call first. */
export function listCorrections(employeeId: string, limit = 10): LoggedCorrection[] {
  return db
    .select()
    .from(callSessions)
    .where(eq(callSessions.employeeId, employeeId))
    .orderBy(desc(callSessions.startedAt))
    .all()
    .filter((session) => session.correctionsJson)
    .flatMap((session) =>
      (JSON.parse(session.correctionsJson!) as CorrectionResult[]).map((correction) => ({
        ...correction,
        callSessionId: session.id,
        scenario: getVoiceScenario(session.scenarioId)?.title ?? session.scenarioId,
        when: session.startedAt,
      })),
    )
    .slice(0, limit);
}
