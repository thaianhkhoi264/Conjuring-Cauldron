"use client";

import { useEffect, useRef, useState } from "react";

export type TranscriptLine = {
  /** Position in the stored transcript; only lines with an index can be corrected. */
  index?: number;
  speaker: "customer" | "employee" | "system";
  text: string;
  /** What speech recognition originally wrote, when an accepted correction replaced it. */
  originalText?: string;
};

export type ReviewControls = {
  /** Corrections the trainee has written so far, by line index. */
  corrections: Record<number, string>;
  max: number;
  onChange: (index: number, said: string | null) => void;
  /** Why a correction was refused, by line index (shown after grading). */
  rejected?: Record<number, string>;
  locked?: boolean;
};

/**
 * The call as a chat: the witch on the left, the trainee on the right. While the call is live, the sentence being
 * spoken appears word by word. After the call, in review mode, the trainee can flag a line that was transcribed
 * wrongly and write what they really said; the grader only accepts believable mishearings.
 */
export function LiveTranscript({
  lines,
  partial,
  customerName,
  live,
  review,
}: {
  lines: TranscriptLine[];
  partial?: { speaker: TranscriptLine["speaker"]; text: string } | null;
  customerName: string;
  live: boolean;
  review?: ReviewControls;
}) {
  const end = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [live, lines.length, partial?.text]);

  const used = review ? Object.keys(review.corrections).length : 0;

  function openEditor(line: TranscriptLine) {
    setEditing(line.index ?? null);
    setDraft(review?.corrections[line.index ?? -1] ?? line.text);
  }

  return (
    <section className="rounded-2xl border border-violet-400/40 bg-violet-950/40 p-5" aria-label="Call transcript">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{live ? "Live transcript" : "Call transcript"}</h3>
        {live && (
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-300">
            <span className="live-dot" aria-hidden="true" /> On the call
          </span>
        )}
      </div>
      {live && lines.length === 0 && !partial && <p className="mt-3 text-sm text-violet-200">Listening for {customerName}…</p>}
      {review && !review.locked && (
        <p className="mt-2 text-sm text-violet-200">
          Check your lines. If the transcript got your words wrong, choose &ldquo;Misheard?&rdquo; on that line and write what you really said
          (up to {review.max} lines). Fixes only count when they look like a mishearing, not a new answer.
        </p>
      )}

      <ol className="chat-scroll mt-4 flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1" aria-live={live ? "polite" : "off"}>
        {lines.map((line, position) => {
          const mine = line.speaker === "employee";
          const corrected = line.index !== undefined ? review?.corrections[line.index] : undefined;
          const refused = line.index !== undefined ? review?.rejected?.[line.index] : undefined;
          const isEditing = editing !== null && editing === line.index;
          return (
            <li key={`${line.index ?? "live"}-${position}`} className={`msg-in flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="mb-0.5 text-xs text-violet-300">{mine ? "You" : `${customerName}`}</span>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "rounded-br-sm bg-emerald-700 text-white" : "rounded-bl-sm bg-violet-900/70 text-violet-50"
                }`}
              >
                {corrected !== undefined ? (
                  <>
                    <span>{corrected}</span>
                    <span className="mt-1 block text-xs text-emerald-100/80">
                      Corrected by you <span className="line-through opacity-70">{line.text}</span>
                    </span>
                  </>
                ) : (
                  <>
                    {line.text}
                    {line.originalText && (
                      <span className="mt-1 block text-xs text-emerald-100/80">
                        Corrected after you reported it <span className="line-through opacity-70">{line.originalText}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
              {refused && <p className="mt-1 max-w-[85%] text-xs text-rose-300">Not applied: {refused}</p>}

              {review && !review.locked && mine && line.index !== undefined && !isEditing && (
                <button
                  type="button"
                  onClick={() => openEditor(line)}
                  disabled={corrected === undefined && used >= review.max}
                  className="mt-1 rounded-lg px-2 py-0.5 text-xs text-violet-200 underline decoration-violet-400/60 underline-offset-2 hover:text-white disabled:opacity-40"
                >
                  {corrected === undefined ? "Misheard?" : "Edit my fix"}
                </button>
              )}
              {isEditing && line.index !== undefined && review && (
                <div className="mt-1 w-full max-w-[85%] rounded-xl border border-violet-400/40 bg-violet-950/70 p-2">
                  <label className="text-xs text-violet-200" htmlFor={`fix-${line.index}`}>
                    What I actually said
                  </label>
                  <textarea
                    id={`fix-${line.index}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={300}
                    rows={2}
                    className="mt-1 w-full rounded border border-violet-400/40 bg-violet-950/60 p-2 text-sm"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const said = draft.trim();
                        review.onChange(line.index!, said && said !== line.text ? said : null);
                        setEditing(null);
                      }}
                      className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-950"
                    >
                      Use this wording
                    </button>
                    {corrected !== undefined && (
                      <button
                        type="button"
                        onClick={() => {
                          review.onChange(line.index!, null);
                          setEditing(null);
                        }}
                        className="rounded-lg border border-violet-400/50 px-3 py-1 text-xs"
                      >
                        Undo my fix
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-violet-400/50 px-3 py-1 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}

        {partial && (
          <li className={`flex flex-col ${partial.speaker === "employee" ? "items-end" : "items-start"}`}>
            <span className="mb-0.5 text-xs text-violet-300">{partial.speaker === "employee" ? "You" : customerName}</span>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm italic opacity-75 ${
                partial.speaker === "employee" ? "rounded-br-sm bg-emerald-700/70 text-white" : "rounded-bl-sm bg-violet-900/50 text-violet-50"
              }`}
            >
              {partial.text}
              <span className="typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          </li>
        )}
        <div ref={end} />
      </ol>
      {review && !review.locked && used > 0 && (
        <p className="mt-3 text-xs text-emerald-200">
          {used} of {review.max} fixes ready. They are checked when you press Get feedback.
        </p>
      )}
    </section>
  );
}
