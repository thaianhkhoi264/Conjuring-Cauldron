import Link from "next/link";

import type { RetestDue } from "@/lib/demo-clock";

/** Short list of stations whose last training is old enough to need a quick retest. */
export function RetestsDue({ items }: { items: RetestDue[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-400/60 bg-amber-950/30 p-5" aria-labelledby="retests-heading">
      <h2 id="retests-heading" className="mb-1 text-lg font-semibold">
        Retests due
      </h2>
      <p className="mb-3 text-sm text-amber-100">A 10 minute session keeps your certification current.</p>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.station} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{item.label}</strong>: {Math.round(item.score * 100)}%
              {item.certified ? "" : " (below the 80% certification line)"}, last trained {item.daysSince} days ago
            </span>
            <Link
              href={item.station === "cs" ? "/employee/training/customer-service" : `/employee/training/${item.station}`}
              className="rounded border border-amber-300/60 px-3 py-1"
            >
              Retest now
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
