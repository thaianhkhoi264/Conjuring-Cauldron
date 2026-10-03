"use client";

import type { CustomerServiceRubric } from "@/lib/db/types";

const labels: Record<Exclude<keyof CustomerServiceRubric, "score">, string> = {
  greeting_and_warmth: "Greeting & warmth",
  order_accuracy: "Order accuracy",
  deescalation_and_empathy: "Empathy & de-escalation",
  problem_resolution: "Problem resolution",
  professional_tone: "Professional tone",
  upsell_or_suggestion: "Suggestion bonus",
};

export function CustomerServiceFeedbackCard({ rubric }: { rubric: CustomerServiceRubric }) {
  const certified = rubric.score >= 0.8;
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm" aria-label="Customer service feedback">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Customer Service evaluation</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{Math.round(rubric.score * 100)}% mastery</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${certified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {certified ? "Certified" : "Keep training"}
        </span>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {Object.entries(labels).map(([key, label]) => {
          const dimension = rubric[key as Exclude<keyof CustomerServiceRubric, "score">];
          return (
            <div key={key} className="rounded-xl bg-violet-50 p-3">
              <dt className="flex justify-between gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><span>{dimension.score}/5</span></dt>
              <dd className="mt-1 text-sm text-slate-600">{dimension.justification}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
