/** Small shared pieces of the visual language: waiting indicators and empty states. No hooks, so they work anywhere. */

/** A tiny ring that spins, for inside buttons while something is being sent or judged. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** Three bubbles bobbing in a row, like something brewing. Announced to screen readers as a status. */
export function Thinking({ label = "Thinking" }: { label?: string }) {
  return (
    <p className="thinking self-start" role="status">
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="text-violet-300">{label}...</span>
    </p>
  );
}

/** Shimmering placeholder lines while text is on its way. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton h-3.5 rounded-full" style={{ width: `${100 - index * 14}%` }} />
      ))}
    </div>
  );
}

/** A friendly note for places with nothing to show yet. */
export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state rounded-xl border border-dashed border-violet-400/30 bg-violet-950/30 px-4 py-6 text-center">
      <div aria-hidden="true" className="empty-icon text-3xl">
        {icon}
      </div>
      <p className="mt-1 font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-violet-200">{children}</p>}
    </div>
  );
}
