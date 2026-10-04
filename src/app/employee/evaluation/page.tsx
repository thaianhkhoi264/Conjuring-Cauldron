import Link from "next/link";
import { notFound } from "next/navigation";

import { EvaluationView } from "@/components/evaluation-view";
import { getEvaluation } from "@/lib/evaluation/load";
import { requireEmployee } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export default async function MyEvaluation() {
  const user = await requireEmployee();
  const evaluation = getEvaluation(user.id);
  if (!evaluation) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-6 md:p-8">
      <header>
        <Link href="/employee" className="text-sm text-violet-300">
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Your evaluation, {user.name}</h1>
        <p className="text-sm text-violet-200">Built from your training results. It updates every time you train.</p>
      </header>
      <EvaluationView evaluation={evaluation} />
    </main>
  );
}
