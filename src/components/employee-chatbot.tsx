"use client";

import { FormEvent, useState } from "react";

type ChatMessage = { role: "employee" | "assistant"; text: string };

export function EmployeeChatbot({ employeeId }: { employeeId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send(message: string, confirmCalloff = false) {
    setLoading(true);
    setMessages((current) => [...current, { role: "employee", text: message }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId, message, confirmCalloff }) });
      const result = await response.json() as { text?: string; error?: string; requiresCalloffConfirmation?: boolean };
      setMessages((current) => [...current, { role: "assistant", text: result.text ?? result.error ?? "I could not answer that." }]);
      setAwaitingConfirmation(Boolean(result.requiresCalloffConfirmation));
    } finally {
      setLoading(false);
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
    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm" aria-label="Employee assistant">
      <h2 className="text-lg font-bold text-slate-900">Cauldron assistant</h2>
      <p className="mt-1 text-sm text-slate-600">Ask about a recipe, your schedule, or request a call-off.</p>
      <div className="mt-4 space-y-2" aria-live="polite">
        {messages.map((message, index) => <p key={index} className={`rounded-lg p-3 text-sm ${message.role === "employee" ? "bg-violet-100 text-violet-950" : "bg-slate-100 text-slate-800"}`}>{message.text}</p>)}
      </div>
      {awaitingConfirmation && <button type="button" disabled={loading} onClick={() => void send("Yes, please confirm my call-off.", true)} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm call-off</button>}
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What is my schedule?" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={loading} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
      </form>
    </section>
  );
}
