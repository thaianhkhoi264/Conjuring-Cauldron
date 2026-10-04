/**
 * Turns whatever the Vapi browser library reports into one readable sentence.
 *
 * The library emits plain objects such as `{ type: "daily-error", error: { errorMsg, message, ... } }` or
 * `{ type: "start-method-error", error: {...} }`, never `Error` instances, so `error.message` alone shows nothing.
 */

type Loose = Record<string, unknown>;

const asRecord = (value: unknown): Loose | undefined => (value && typeof value === "object" ? (value as Loose) : undefined);
const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** The most specific message found in a Vapi error payload, plus its type when there is one. */
export function vapiErrorDetail(error: unknown): { message?: string; type?: string } {
  if (typeof error === "string") return { message: asText(error) };
  if (error instanceof Error) return { message: asText(error.message) };

  const top = asRecord(error);
  if (!top) return {};
  const inner = asRecord(top.error);
  const message =
    asText(inner?.errorMsg) ??
    asText(inner?.message) ??
    asText(inner?.errorDetail) ??
    asText(inner?.reason) ??
    asText(top.errorMsg) ??
    asText(top.message) ??
    asText(top.error) ??
    asText(asRecord(inner?.error)?.message);
  return { message, type: asText(top.type) };
}

// Order matters: the first match wins, so the more specific "no device" case comes before "permission".
const HINTS: { when: RegExp; hint: string }[] = [
  { when: /notfound|no (audio|microphone|mic)|device not found|requested device/i, hint: "No microphone was found. Plug in or enable one and try again." },
  {
    when: /permission|not ?allowed|denied/i,
    hint: "Allow the microphone for this address (click the padlock in the address bar), then try again.",
  },
  {
    when: /eject|meeting has ended|ended due to|no longer available/i,
    hint: "Vapi ended the call as it started. This usually means the assistant's model or voice is not available on your Vapi account: open the assistant in the Vapi dashboard and check its model and voice settings.",
  },
  { when: /network|ice |connection|timed? ?out|unreachable|websocket|webrtc/i, hint: "Network trouble. Try turning off any VPN and check the connection." },
];

/** One sentence for the screen: the real reason, the error type in brackets, and a hint when we recognise it. */
export function describeVapiError(error: unknown): string {
  const { message, type } = vapiErrorDetail(error);
  if (!message) return type ? `The voice call failed (${type}). Open the browser console for details.` : "The voice call failed. Open the browser console for details.";
  const hint = HINTS.find((h) => h.when.test(message))?.hint ?? HINTS.find((h) => type && h.when.test(type))?.hint;
  return `The voice call failed: ${message}${type ? ` (${type})` : ""}.${hint ? ` ${hint}` : ""}`;
}
