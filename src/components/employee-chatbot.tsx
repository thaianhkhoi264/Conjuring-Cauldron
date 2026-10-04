"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

type ChatMessage = { role: "employee" | "assistant"; text: string };
type Pending = { assignmentId: string; message: string };

const SUGGESTIONS = ["What is my schedule this week?", "How do I make a Cauldron Burger?", "What goes in a Love Potion Latte?"];

export function EmployeeChatbot() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(message: string, confirmAssignmentId?: string) {
    const history = messages.slice(-8);
    setLoading(true);
    setPending(null);
    setMessages((current) => [...current, { role: "employee", text: message }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, confirmAssignmentId }),
      });
      const result = (await response.json()) as { text?: string; error?: string; pendingCalloff?: Pending | null; calledOff?: boolean };
      setMessages((current) => [...current, { role: "assistant", text: result.text ?? result.error ?? "I could not answer that." }]);
      setPending(result.pendingCalloff ?? null);
      if (result.calledOff) router.refresh(); // My shifts and the manager's inbox now reflect it
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "I could not reach the assistant. Please check your connection and try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ block: "nearest" }), 50);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    setDraft("");
    void send(message);
  }

  return (
    <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5" aria-labelledby="chat-heading">
      <h2 id="chat-heading" className="text-lg font-semibold">
        Cauldron assistant
      </h2>
      <p className="mt-1 text-sm text-violet-200">Ask about a recipe, your own shifts, or request a call-off.</p>

      <div className="mt-4 flex max-h-96 flex-col gap-2 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={loading}
                onClick={() => void send(suggestion)}
                className="rounded-full border border-violet-400/50 px-3 py-1 text-sm hover:bg-violet-900/50 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <p
            key={index}
            className={`max-w-prose whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              message.role === "employee" ? "self-end bg-emerald-700 text-white" : "self-start bg-violet-900/60"
            }`}
          >
            {message.text}
          </p>
        ))}
        {loading && <p className="text-sm text-violet-300">Thinking...</p>}
        <div ref={endRef} />
      </div>

      {pending && (
        <div className="mt-3 rounded border border-amber-400/60 bg-amber-950/30 p-3 text-sm">
          <p>{pending.message || "Confirm that you want to call off this shift."}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void send("Yes, please confirm my call-off.", pending.assignmentId)}
              className="rounded bg-rose-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              Confirm call-off
            </button>
            <button type="button" disabled={loading} onClick={() => setPending(null)} className="rounded border border-violet-400/50 px-3 py-1.5">
              Keep my shift
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="chat-input">
          Message the Cauldron assistant
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          placeholder="What is my schedule?"
          className="min-w-0 flex-1 rounded border border-violet-400/40 bg-violet-950/40 p-2 text-sm"
        />
        <button disabled={loading || !draft.trim()} className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-50">
          Send
        </button>
      </form>
    </section>
  );
}
