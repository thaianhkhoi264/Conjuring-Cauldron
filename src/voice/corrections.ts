import type { TranscriptTurn } from "@/lib/db/types";

/**
 * Transcript corrections. The call is transcribed by speech recognition, which sometimes mishears the
 * trainee. A trainee may report a line that was transcribed wrongly and say what they actually said.
 * Because a correction could also be used to rewrite a bad answer into a good one, the correction is only
 * accepted when it looks like a mishearing: close in wording and length to what was transcribed. A
 * completely different sentence is refused. At most MAX_CORRECTIONS lines per call.
 */

export const MAX_CORRECTIONS = 3;
export const MAX_CORRECTION_CHARS = 300;
/** A correction must be at least this similar (0 to 1) to the transcribed line. */
export const MIN_SIMILARITY = 0.5;

export type CorrectionRequest = { index: number; said: string };

export type CorrectionStatus = "applied" | "rejected";

export type CorrectionResult = {
  index: number;
  original: string;
  said: string;
  status: CorrectionStatus;
  /** Why a correction was refused (shown to the trainee). */
  reason?: string;
};

export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1 for identical wording, 0 for nothing in common (character level, ignoring case and punctuation). */
export function similarity(a: string, b: string) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - editDistance(x, y) / longest;
}

/** Whether `said` is plausibly the same utterance as the transcribed `heard` (a mishearing, not a rewrite). */
export function looksLikeMishearing(heard: string, said: string) {
  if (normalizeText(said).length === 0) return false;
  if (said.trim().length > heard.trim().length * 1.6 + 20) return false; // far longer: new content, not a mishearing
  return similarity(heard, said) >= MIN_SIMILARITY;
}

function parseRequests(raw: unknown): CorrectionRequest[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const requests: CorrectionRequest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { index, said } = item as { index?: unknown; said?: unknown };
    if (typeof index !== "number" || !Number.isInteger(index) || typeof said !== "string" || seen.has(index)) continue;
    seen.add(index);
    requests.push({ index, said: said.trim().slice(0, MAX_CORRECTION_CHARS) });
  }
  return requests.slice(0, 10); // bound the work; only MAX_CORRECTIONS can ever apply
}

/**
 * Check requested corrections against the stored transcript (the one the grader will see). Returns what was
 * decided for each request and the transcript to grade, with accepted corrections applied.
 */
export function applyCorrections(turns: TranscriptTurn[], raw: unknown) {
  const requests = parseRequests(raw);
  const results: CorrectionResult[] = [];
  const corrected = turns.map((turn) => ({ ...turn }));

  let appliedCount = 0;
  for (const request of requests) {
    const turn = turns[request.index];
    const base = { index: request.index, original: turn?.text ?? "", said: request.said };
    if (!turn || turn.speaker !== "employee") {
      results.push({ ...base, status: "rejected", reason: "Only your own lines can be corrected." });
    } else if (appliedCount >= MAX_CORRECTIONS) {
      results.push({ ...base, status: "rejected", reason: `You can correct at most ${MAX_CORRECTIONS} lines per call.` });
    } else if (!looksLikeMishearing(turn.text, request.said)) {
      results.push({
        ...base,
        status: "rejected",
        reason: "That is too different from what was transcribed to be a mishearing, so the original line was kept.",
      });
    } else {
      corrected[request.index] = { ...turn, text: request.said };
      results.push({ ...base, status: "applied" });
      appliedCount++;
    }
  }

  return { transcript: corrected, results };
}
