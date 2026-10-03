import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attempts, callSessions } from "@/lib/db/schema";
import type { CustomerServiceRubric, RubricDimension, TranscriptTurn } from "@/lib/db/types";
import { restaurantContext } from "./scenarios";

export const customerServiceRubricSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "greeting_and_warmth",
    "order_accuracy",
    "deescalation_and_empathy",
    "problem_resolution",
    "professional_tone",
    "upsell_or_suggestion",
  ],
  properties: Object.fromEntries(
    [
      "greeting_and_warmth",
      "order_accuracy",
      "deescalation_and_empathy",
      "problem_resolution",
      "professional_tone",
      "upsell_or_suggestion",
    ].map((name) => [
      name,
      {
        type: "object",
        additionalProperties: false,
        required: ["score", "justification"],
        properties: {
          score: { type: "number", minimum: 0, maximum: 5 },
          justification: { type: "string" },
        },
      },
    ]),
  ),
} as const;

export type JsonGenerator = <T>(schema: object, prompt: string) => Promise<T>;
export type ScoreApplier = (employeeId: string, station: "cs", score: number, source: string) => Promise<void> | void;

const dimensions = [
  "greeting_and_warmth",
  "order_accuracy",
  "deescalation_and_empathy",
  "problem_resolution",
  "professional_tone",
  "upsell_or_suggestion",
] as const;

type LlmRubric = Omit<CustomerServiceRubric, "score">;

function isDimension(value: unknown): value is RubricDimension {
  if (!value || typeof value !== "object") return false;
  const dimension = value as RubricDimension;
  return Number.isFinite(dimension.score)
    && dimension.score >= 0
    && dimension.score <= 5
    && typeof dimension.justification === "string"
    && dimension.justification.trim().length > 0;
}

export function calculateCustomerServiceScore(rubric: LlmRubric) {
  const base = (
    rubric.greeting_and_warmth.score * 0.2
    + rubric.order_accuracy.score * 0.25
    + rubric.deescalation_and_empathy.score * 0.25
    + rubric.problem_resolution.score * 0.2
    + rubric.professional_tone.score * 0.1
  ) / 5;
  const upsellBonus = (rubric.upsell_or_suggestion.score / 5) * 0.05;
  return Math.round(Math.min(1, base + upsellBonus) * 1000) / 1000;
}

export function validateCustomerServiceRubric(value: unknown): CustomerServiceRubric {
  if (!value || typeof value !== "object") throw new Error("Gemini returned an invalid customer-service rubric.");
  const rubric = value as Partial<LlmRubric>;
  for (const dimension of dimensions) {
    if (!isDimension(rubric[dimension])) throw new Error(`Invalid ${dimension} rubric dimension.`);
  }
  const completeRubric = rubric as LlmRubric;
  return { ...completeRubric, score: calculateCustomerServiceScore(completeRubric) };
}

export function customerServiceEvaluationPrompt(transcript: TranscriptTurn[]) {
  return `${restaurantContext}

You are a strict evaluator. Score only what the employee demonstrably said in the transcript. Return JSON matching the schema exactly. Each dimension is 0 to 5 and has a one-line concrete justification. Do not award points for actions the employee merely promised but did not explain. The upsell score is optional and should be 0 when there was no appropriate opportunity. Be consistent: this result is stored permanently and never regenerated.

Rubric:
- greeting_and_warmth: welcoming, respectful opening and attentive tone.
- order_accuracy: verifies the order or provides correct, grounded menu information.
- deescalation_and_empathy: acknowledges frustration and keeps composure where relevant.
- problem_resolution: offers a policy-compliant, actionable fix.
- professional_tone: courteous, clear, and appropriate as a restaurant employee.
- upsell_or_suggestion: a relevant, non-pushy suggestion; lowest-weighted bonus only.

Transcript:
${transcript.map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`).join("\n")}`;
}

/**
 * Evaluates once, stores both the immutable rubric and an attempt, then calls
 * Agent B's shared applyScore boundary to update mastery.
 */
export async function evaluateCustomerServiceSession(
  sessionId: string,
  generateJson: JsonGenerator,
  applyScore: ScoreApplier,
) {
  const session = db.select().from(callSessions).where(eq(callSessions.id, sessionId)).get();
  if (!session) throw new Error("Call session not found.");
  if (session.rubricJson && session.score !== null) {
    return { rubric: JSON.parse(session.rubricJson) as CustomerServiceRubric, score: session.score, reused: true };
  }

  const transcript = session.transcriptJson ? (JSON.parse(session.transcriptJson) as TranscriptTurn[]) : [];
  if (!transcript.length) throw new Error("A transcript is required before evaluation.");

  const rubric = validateCustomerServiceRubric(
    await generateJson<LlmRubric>(customerServiceRubricSchema, customerServiceEvaluationPrompt(transcript)),
  );
  const endedAt = session.endedAt ? new Date(session.endedAt) : new Date();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000));

  db.transaction((tx) => {
    tx.update(callSessions)
      .set({ rubricJson: JSON.stringify(rubric), score: rubric.score, endedAt: session.endedAt ?? endedAt.toISOString() })
      .where(eq(callSessions.id, sessionId))
      .run();
    tx.insert(attempts).values({
      id: crypto.randomUUID(),
      employeeId: session.employeeId,
      station: "cs",
      callSessionId: sessionId,
      score: rubric.score,
      feedbackJson: JSON.stringify(rubric),
      durationSeconds,
    }).run();
  });

  await applyScore(session.employeeId, "cs", rubric.score, `call_session:${sessionId}`);
  return { rubric, score: rubric.score, reused: false };
}
