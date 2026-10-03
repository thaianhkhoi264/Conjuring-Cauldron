import type { TranscriptTurn } from "@/lib/db/types";

type VapiMessage = {
  role?: string;
  message?: string;
  content?: string;
  transcript?: string;
  time?: number;
};

function toSpeaker(role?: string): TranscriptTurn["speaker"] | undefined {
  if (role === "user" || role === "customer") return "customer";
  if (role === "assistant" || role === "bot") return "employee";
  return undefined;
}

/** Accepts both conversation-update and final call-artifact message shapes. */
export function extractTranscript(payload: unknown): TranscriptTurn[] {
  const record = payload as { message?: { messages?: VapiMessage[]; artifact?: { messages?: VapiMessage[] } } };
  const messages = record.message?.artifact?.messages ?? record.message?.messages ?? [];

  return messages.flatMap((item) => {
    const speaker = toSpeaker(item.role);
    const text = item.message ?? item.content ?? item.transcript;
    return speaker && text ? [{ speaker, text: text.trim(), timestamp: item.time }] : [];
  });
}

export function mergeTranscript(existing: TranscriptTurn[], incoming: TranscriptTurn[]) {
  const merged = [...existing];
  for (const turn of incoming) {
    const duplicate = merged.some((current) => current.speaker === turn.speaker && current.text === turn.text);
    if (!duplicate) merged.push(turn);
  }
  return merged;
}
