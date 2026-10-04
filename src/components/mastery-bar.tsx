const CERTIFIED_AT = 0.8;

/** Progress bar with a marker at the 80% certification line. */
export function MasteryBar({ score, label }: { score: number | null; label?: string }) {
  const percent = Math.round((score ?? 0) * 100);
  const certified = (score ?? 0) >= CERTIFIED_AT;
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs">
          <span>{label}</span>
          <span>{score === null ? "Not started" : certified ? `${percent}% certified` : `${percent}%`}</span>
        </div>
      )}
      <div
        className="relative h-3 overflow-hidden rounded-full bg-violet-950"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label ?? "Mastery"}
      >
        <div
          className={`bar-grow h-full ${certified ? "bg-gradient-to-r from-emerald-500 to-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]" : "bg-gradient-to-r from-violet-500 to-violet-300"}`}
          style={{ width: `${percent}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${CERTIFIED_AT * 100}%` }} />
      </div>
    </div>
  );
}
