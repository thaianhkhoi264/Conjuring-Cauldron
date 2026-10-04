import Link from "next/link";

import { EvaluationNarrative } from "@/components/evaluation-narrative";
import { MasteryBar } from "@/components/mastery-bar";
import type { Evaluation } from "@/lib/evaluation/build";

const TREND_TEXT = { up: "trending up", down: "trending down", steady: "holding steady" } as const;

function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-lg border border-violet-400/30 bg-violet-950/30 p-5" aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-violet-300">{empty}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The evaluation report: everything on this page is computed from stored scores. */
export function EvaluationView({ evaluation, employeeId }: { evaluation: Evaluation; employeeId?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5">
        <h2 className="text-xl font-semibold">{evaluation.headline}</h2>
        <p className="mt-1 text-sm text-violet-200">{evaluation.schedulingStatus}</p>
        <div className="mt-4 grid gap-4">
          {evaluation.stations.map((s) => (
            <div key={s.station}>
              <MasteryBar score={s.score} label={s.label} />
              <p className="mt-1 text-xs text-violet-300">
                {s.attempts === 0 ? "Not started" : `${s.attempts} attempt${s.attempts === 1 ? "" : "s"}`}
                {s.trend && ` · ${TREND_TEXT[s.trend]}`}
                {s.retestDue && <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 font-semibold text-black">Retest due</span>}
              </p>
            </div>
          ))}
        </div>
      </section>

      {evaluation.hasData && <EvaluationNarrative employeeId={employeeId} />}

      <div className="grid gap-5 md:grid-cols-2">
        <List title="Strengths" items={evaluation.strengths} empty="Strengths show up here once a chapter has been trained." />
        <List title="Weaknesses" items={evaluation.weaknesses} empty="No repeated mistakes so far." />
      </div>

      <section className="rounded-lg border border-violet-400/30 bg-violet-950/30 p-5" aria-label="Needs improvement">
        <h2 className="mb-2 text-lg font-semibold">Needs improvement</h2>
        {evaluation.needsImprovement.length === 0 && evaluation.notStarted.length === 0 ? (
          <p className="text-sm text-violet-300">Every station is certified. Nice work.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {evaluation.needsImprovement.map((n) => (
              <li key={n.station}>
                <strong>{n.label}</strong>: {Math.round(n.score * 100)}%, needs {Math.round(n.gapToCertify * 100)}% more to certify. {n.suggestion}
              </li>
            ))}
            {evaluation.notStarted.map((n) => (
              <li key={n.station}>
                <strong>{n.label}</strong>: not started yet.
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <List
          title="Can start now"
          items={evaluation.canStartNow.map((c) => c.text)}
          empty="Reaching 80% in one chapter unlocks working that station."
        />
        <List title="Next steps" items={evaluation.nextSteps} empty="You are all caught up." />
      </div>

      {!employeeId && (
        <p>
          <Link href="/employee/training" className="inline-block rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:brightness-110">
            Go to training
          </Link>
        </p>
      )}
    </div>
  );
}
