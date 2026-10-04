"use client";

import type { CustomerServiceRubric } from "@/lib/db/types";

type DimensionKey = Exclude<keyof CustomerServiceRubric, "score" | "judgedBy">;

const labels: Record<DimensionKey, string> = {
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
    <section className="rounded-2xl border border-violet-400/40 bg-violet-950/40 p-6" aria-label="Customer service feedback">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-300">Customer Service evaluation</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{Math.round(rubric.score * 100)}% mastery</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${certified ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
          {certified ? "Certified" : "Keep training"}
        </span>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {Object.entries(labels).map(([key, label]) => {
          const dimension = rubric[key as DimensionKey];
          return (
            <div key={key} className="rounded-xl bg-violet-900/40 p-3">
              <dt className="flex justify-between gap-2 text-sm font-semibold text-violet-50"><span>{label}</span><span>{dimension.score}/5</span></dt>
              <dd className="mt-1 text-sm text-violet-200">{dimension.justification}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
