"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Proposal = {
  summary: string;
  ok: boolean;
  lines: string[];
  errors: string[];
  violations: string[];
  newGaps: string[];
  changes: unknown[];
};

type Message = {
  role: "user" | "assistant";
  text: string;
  proposal?: Proposal | null;
  applied?: boolean;
};

const SUGGESTIONS = [
  "Why is Elowen working on Saturday?",
  "Who could cover Sunday close at the register?",
  "Give Selene fewer shifts if you can.",
];

export function ScheduleAssistant() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The assistant could not answer.");
      setMessages((current) => [...current, { role: "assistant", text: body.reply, proposal: body.proposal }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ block: "nearest" }), 50);
    }
  }

  async function apply(index: number) {
    const proposal = messages[index]?.proposal;
    if (!proposal) return;
    setApplyingIndex(index);
    setError(null);
    try {
      const response = await fetch("/api/schedule/changes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: proposal.changes }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Those changes could not be applied.");
      setMessages((current) => current.map((m, i) => (i === index ? { ...m, applied: true } : m)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those changes could not be applied.");
    } finally {
      setApplyingIndex(null);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="assistant-heading">
      <div>
        <h2 id="assistant-heading" className="text-xl font-semibold">
          Schedule assistant
        </h2>
        <p className="text-sm text-violet-200">
          Ask why someone is scheduled, find cover, or request a change. The assistant only proposes; you press Apply, and every
          change is checked against the scheduling rules first.
        </p>
      </div>

      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-lg border border-violet-400/30 bg-violet-950/30 p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                disabled={busy}
                className="rounded-full border border-violet-400/50 px-3 py-1 text-sm hover:bg-violet-900/50 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, index) => (
          <div key={index} className={m.role === "user" ? "self-end" : "self-start"}>
            <div
              className={`max-w-prose whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-violet-600 text-white" : "bg-violet-900/60"
              }`}
            >
              {m.text}
            </div>

            {m.proposal && m.proposal.changes.length > 0 && (
              <div
                className={`mt-2 max-w-prose rounded-lg border p-3 text-sm ${
                  m.proposal.ok ? "border-emerald-400/60 bg-emerald-950/30" : "border-red-400/60 bg-red-950/30"
                }`}
              >
                <p className="font-semibold">{m.proposal.ok ? "Proposed change" : "Rejected by the scheduling rules"}</p>
                {m.proposal.summary && <p className="text-violet-200">{m.proposal.summary}</p>}
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {m.proposal.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {[...m.proposal.errors, ...m.proposal.violations].map((problem) => (
                  <p key={problem} className="mt-1 text-red-200">
                    {problem}
                  </p>
                ))}
                {m.proposal.newGaps.length > 0 && (
                  <p className="mt-1 text-amber-300">This would leave {m.proposal.newGaps.length} slot(s) uncovered.</p>
                )}
                {m.proposal.ok &&
                  (m.applied ? (
                    <p className="mt-2 font-semibold text-emerald-300">Applied. The schedule above is updated.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apply(index)}
                      disabled={applyingIndex !== null}
                      className="mt-3 rounded bg-emerald-500 px-4 py-1.5 font-semibold text-black disabled:opacity-50"
                    >
                      {applyingIndex === index ? "Applying..." : "Apply changes"}
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}

        {busy && <p className="text-sm text-violet-300">Thinking...</p>}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Message the schedule assistant
        </label>
        <input
          id="assistant-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={1000}
          placeholder="Ask about the schedule..."
          className="flex-1 rounded border border-violet-400/40 bg-violet-950/40 p-2 text-sm"
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded bg-violet-500 px-4 py-2 font-semibold text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </section>
  );
}
