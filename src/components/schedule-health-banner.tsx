import type { ScheduleHealth } from "@/lib/scheduling/store";

/** Tells the manager when the saved schedule no longer matches current skills or has open gaps. */
export function ScheduleHealthBanner({ health }: { health: ScheduleHealth }) {
  if (!health.hasSchedule) return null;
  if (health.issues.length === 0 && health.gaps === 0) return null;

  return (
    <div role="status" className="rounded border border-amber-400/60 bg-amber-950/30 p-3 text-sm">
      <p className="font-semibold">The saved schedule needs a refresh.</p>
      <p className="mt-1">
        {health.issues.length > 0 && `${health.issues.length} assignment problem(s) with current skills or availability. `}
        {health.gaps > 0 && `${health.gaps} required station slot(s) have nobody assigned. `}
        Press <strong>Regenerate schedule</strong> to restaff the week.
      </p>
      {health.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-100">
          {health.issues.slice(0, 4).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
          {health.issues.length > 4 && <li>and {health.issues.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}
