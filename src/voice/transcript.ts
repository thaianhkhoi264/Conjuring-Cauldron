import type { TranscriptTurn } from "@/lib/db/types";

type VapiMessage = {
  role?: string;
  message?: string;
  content?: string;
  transcript?: string;
  time?: number;
};

/**
 * Who is speaking, from a Vapi role. In our calls the AI plays the witch CUSTOMER (Vapi's "assistant")
 * and the trainee on the microphone is Vapi's "user". Only `employee` turns are ever graded, so getting
 * this the right way round matters: the wrong way would grade the witch instead of the trainee.
 * Roles that are already ours ("customer", "employee") pass through; "system" and "tool" are ignored.
 */
export function toSpeaker(role?: string): TranscriptTurn["speaker"] | undefined {
  if (role === "user" || role === "employee") return "employee";
  if (role === "assistant" || role === "bot" || role === "customer") return "customer";
  return undefined;
}

type BrowserMessage = { type?: string; role?: string; transcriptType?: string; transcript?: string };

/**
 * One message from the Vapi browser SDK as a transcript turn. Only final transcripts count: partial ones
 * are the same sentence arriving word by word and would fill the transcript with fragments.
 */
export function vapiMessageToTurn(message: BrowserMessage): TranscriptTurn | undefined {
  if (message.type !== "transcript" || message.transcriptType !== "final") return undefined;
  const speaker = toSpeaker(message.role);
  const text = message.transcript?.trim();
  return speaker && text ? { speaker, text } : undefined;
}

/** The sentence being spoken right now (a partial transcript), for the live view. Never graded. */
export function vapiMessageToPartial(message: BrowserMessage): TranscriptTurn | undefined {
  if (message.type !== "transcript" || message.transcriptType !== "partial") return undefined;
  const speaker = toSpeaker(message.role);
  const text = message.transcript?.trim();
  return speaker && text ? { speaker, text } : undefined;
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

const trimEnd = (text: string) => text.trim().replace(/[.!?,\s]+$/, "");

/**
 * Speech arrives as a sentence that grows ("I'm sorry." then "I'm sorry. We can remake it."). If the next turn from
 * the same speaker is just a longer version of the previous one, keep only the longer, finished version.
 */
export function collapseGrowingTurns(turns: TranscriptTurn[]): TranscriptTurn[] {
  const result: TranscriptTurn[] = [];
  for (const turn of turns) {
    const previous = result[result.length - 1];
    const prefix = previous ? trimEnd(previous.text) : "";
    if (previous && previous.speaker === turn.speaker && prefix && turn.text.trim().startsWith(prefix)) {
      result[result.length - 1] = turn;
    } else {
      result.push(turn);
    }
  }
  return result;
}

export function mergeTranscript(existing: TranscriptTurn[], incoming: TranscriptTurn[]) {
  const merged = [...existing];
  for (const turn of incoming) {
    const duplicate = merged.some((current) => current.speaker === turn.speaker && current.text === turn.text);
    if (!duplicate) merged.push(turn);
  }
  return merged;
}
