import Link from "next/link";
import { notFound } from "next/navigation";

import { EvaluationView } from "@/components/evaluation-view";
import { getEvaluation } from "@/lib/evaluation/load";
import { requireManager } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export default async function EmployeeEvaluation({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const evaluation = getEvaluation(id);
  if (!evaluation) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-6 md:p-8">
      <header>
        <Link href="/manager" className="text-sm text-violet-300">
          ← Back to the schedule
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Evaluation: {evaluation.name}</h1>
      </header>
      <EvaluationView evaluation={evaluation} employeeId={id} />
    </main>
  );
}
