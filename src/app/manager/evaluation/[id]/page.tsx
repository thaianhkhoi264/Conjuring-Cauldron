import Link from "next/link";
import { notFound } from "next/navigation";

import { EvaluationView } from "@/components/evaluation-view";
import { getEvaluation } from "@/lib/evaluation/load";
import { requireManager } from "@/lib/require-user";
import { listCorrections } from "@/voice/correction-log";

export const dynamic = "force-dynamic";

export default async function EmployeeEvaluation({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const evaluation = getEvaluation(id);
  if (!evaluation) notFound();
  const corrections = listCorrections(id);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-6 md:p-8">
      <header>
        <Link href="/manager" className="text-sm text-violet-300">
          ← Back to the schedule
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Evaluation: {evaluation.name}</h1>
      </header>
      <EvaluationView evaluation={evaluation} employeeId={id} />
      {corrections.length > 0 && (
        <section className="rounded-lg border border-violet-400/30 bg-violet-950/30 p-5" aria-labelledby="fixes-heading">
          <h2 id="fixes-heading" className="text-lg font-semibold">
            Transcript fixes reported
          </h2>
          <p className="mt-1 text-sm text-violet-200">
            {evaluation.name} said the call transcript misheard them. A fix is only applied when it looks like a mishearing, not a new answer.
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            {corrections.map((c) => (
              <li key={`${c.callSessionId}-${c.index}`} className="rounded-lg bg-violet-900/30 p-3">
                <p className="text-xs text-violet-300">
                  {c.scenario} · {c.when.slice(0, 10)} ·{" "}
                  <span className={c.status === "applied" ? "text-emerald-300" : "text-amber-300"}>{c.status === "applied" ? "applied" : "not applied"}</span>
                </p>
                <p>
                  <span className="text-violet-300">Transcribed: </span>
                  {c.original}
                </p>
                <p>
                  <span className="text-violet-300">They say: </span>
                  {c.said}
                </p>
                {c.reason && <p className="text-xs text-amber-200">{c.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
