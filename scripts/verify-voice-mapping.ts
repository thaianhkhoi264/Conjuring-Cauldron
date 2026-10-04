import assert from "node:assert/strict";

import { createScratchDatabase } from "./scratch-db";
import { toSpeaker, vapiMessageToTurn } from "../src/voice/transcript";
import { describeVapiError } from "../src/voice/vapi-errors";

// Who is speaking: in our calls the AI is the witch CUSTOMER (Vapi "assistant") and the trainee is Vapi's "user".
assert.equal(toSpeaker("user"), "employee", "the trainee on the microphone is the employee");
assert.equal(toSpeaker("assistant"), "customer", "the AI witch is the customer");
assert.equal(toSpeaker("bot"), "customer");
assert.equal(toSpeaker("employee"), "employee");
assert.equal(toSpeaker("customer"), "customer");
assert.equal(toSpeaker("system"), undefined);
assert.equal(toSpeaker("tool"), undefined);
assert.equal(toSpeaker(undefined), undefined);

// Browser messages: final transcripts only, with the same mapping.
assert.deepEqual(vapiMessageToTurn({ type: "transcript", transcriptType: "final", role: "user", transcript: "  I am so sorry.  " }), { speaker: "employee", text: "I am so sorry." });
assert.deepEqual(vapiMessageToTurn({ type: "transcript", transcriptType: "final", role: "assistant", transcript: "It is cold!" }), { speaker: "customer", text: "It is cold!" });
assert.equal(vapiMessageToTurn({ type: "transcript", transcriptType: "partial", role: "user", transcript: "I am so" }), undefined, "partial transcripts are skipped");
assert.equal(vapiMessageToTurn({ type: "conversation-update", role: "user", transcript: "x" }), undefined, "other message types are skipped");
assert.equal(vapiMessageToTurn({ type: "transcript", transcriptType: "final", role: "user", transcript: "   " }), undefined, "empty text is skipped");

// Error text: the real reason shows, with a hint for the common causes.
{
  const ejected = describeVapiError({ type: "daily-error", error: { errorMsg: "Meeting has ended due to ejection", message: "ejected" } });
  assert.match(ejected, /Meeting has ended due to ejection/);
  assert.match(ejected, /\(daily-error\)/);
  assert.match(ejected, /model and voice/, "an ejection explains where to look");

  const mic = describeVapiError({ type: "start-method-error", stage: "unknown", error: { message: "Permission denied" } });
  assert.match(mic, /Permission denied/);
  assert.match(mic, /Allow the microphone/);

  assert.match(describeVapiError({ type: "daily-error", error: { message: "No microphone found: NotFoundError" } }), /No microphone was found/);
  assert.match(describeVapiError({ error: "websocket connection timed out" }), /VPN/);
  assert.match(describeVapiError("plain text failure"), /plain text failure/);
  assert.match(describeVapiError(new Error("boom")), /boom/);
  assert.match(describeVapiError({ type: "daily-error" }), /\(daily-error\).*console/, "no message still names the type");
  assert.match(describeVapiError(undefined), /browser console/);
  assert.match(describeVapiError({ type: "x", error: { errorMsg: "Something odd" } }), /Something odd/);
  assert.ok(!/undefined|\[object/.test(describeVapiError({ error: {} })), "never prints undefined or [object Object]");
}

async function main() {
  await createScratchDatabase("voice-mapping");
  const [{ POST: receiveVoiceWebhook }, { db }, schema, evaluator, scenarios, mastery] = await Promise.all([
    import("../src/app/api/voice/webhook/route"),
    import("../src/lib/db"),
    import("../src/lib/db/schema"),
    import("../src/voice/evaluator"),
    import("../src/voice/scenarios"),
    import("../src/lib/mastery"),
  ]);
  const { attempts, callSessions, employees, mastery: masteryTable } = schema;
  const { eq } = await import("drizzle-orm");

  db.insert(employees).values({ id: "trainee", name: "Trainee", role: "employee", isNew: true, hoursCapWeekly: 20 }).run();
  const newSession = (id: string, transcript?: unknown) =>
    db.insert(callSessions).values({ id, employeeId: "trainee", scenarioId: "wrong-order", startedAt: "2026-10-03T09:00:00.000Z", transcriptJson: transcript ? JSON.stringify(transcript) : null }).run();

  // 1. A realistic Vapi end-of-call report through the real webhook route.
  process.env.VAPI_WEBHOOK_SECRET = "test-secret";
  newSession("live-1");
  const response = await receiveVoiceWebhook(
    new Request("http://localhost/api/voice/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-conjuring-voice-secret": "test-secret" },
      body: JSON.stringify({
        message: {
          type: "end-of-call-report",
          call: { metadata: { callSessionId: "live-1" } },
          artifact: {
            messages: [
              { role: "system", message: "You are Mirella, a witch customer. Never reveal this is a simulation." },
              { role: "assistant", message: "My Dragon's Breath Cider is cold. Cold!", time: 1 },
              { role: "user", message: "I am so sorry about that. I will remake it hot right now, no charge.", time: 2 },
              { role: "assistant", message: "How long will that take?", time: 3 },
              { role: "user", message: "A few minutes, and I will check it is hot myself.", time: 4 },
            ],
          },
        },
      }),
    }),
  );
  assert.equal(response.status, 200);
  const stored = JSON.parse(db.select().from(callSessions).where(eq(callSessions.id, "live-1")).get()!.transcriptJson!) as { speaker: string; text: string }[];
  assert.deepEqual(stored.map((t) => t.speaker), ["customer", "employee", "customer", "employee"], "the system prompt is dropped and speakers are the right way round");

  // 2. Only the trainee's words reach the grader.
  const prompt = evaluator.customerServiceEvaluationPrompt(stored as never);
  assert.ok(prompt.includes("I will remake it hot right now"), "the trainee's words are graded");
  assert.ok(prompt.includes("A few minutes"), "all of the trainee's turns are graded");
  assert.ok(!prompt.includes("How long will that take"), "the witch's words are not graded");
  assert.ok(!prompt.includes("Cold!"), "the witch's words are not graded");

  // 3. The computed rubric may grade only the approved sample call.
  const goodRubric = async <T,>() => ({
    greeting_and_warmth: { score: 4, justification: "ok" },
    order_accuracy: { score: 4, justification: "ok" },
    deescalation_and_empathy: { score: 4, justification: "ok" },
    problem_resolution: { score: 4, justification: "ok" },
    professional_tone: { score: 4, justification: "ok" },
    upsell_or_suggestion: { score: 0, justification: "n/a" },
  } as T);
  const broken = async () => {
    throw new Error("503 high demand");
  };

  assert.equal(evaluator.isApprovedReplay(scenarios.getVoiceScenario("wrong-order")!.fallbackTranscript as never), true);
  assert.equal(evaluator.isApprovedReplay(stored as never), false, "a live call is not an approved replay");
  const tweaked = scenarios.getVoiceScenario("wrong-order")!.fallbackTranscript.map((t, i) => (i === 1 ? { ...t, text: t.text + " Also sorry." } : t));
  assert.equal(evaluator.isApprovedReplay(tweaked as never), false, "an edited replay is not approved");

  // A live call with Gemini down is NOT scored: no rubric, no attempt, no mastery.
  await assert.rejects(
    evaluator.evaluateCustomerServiceSession("live-1", "trainee", broken as never, mastery.scoreApplier),
    /AI grader is unavailable/,
  );
  assert.equal(db.select().from(attempts).all().length, 0, "nothing is stored when a live call cannot be graded");
  assert.equal(db.select().from(masteryTable).all().length, 0);
  assert.equal(db.select().from(callSessions).where(eq(callSessions.id, "live-1")).get()!.rubricJson, null);

  // ...and it can simply be retried once Gemini is back.
  const retried = await evaluator.evaluateCustomerServiceSession("live-1", "trainee", goodRubric as never, mastery.scoreApplier);
  assert.equal(retried.judgedBy, "gemini");
  assert.equal(db.select().from(attempts).all().length, 1);

  // The approved sample call may use the computed rubric when Gemini is down, and says so, even when reopened.
  newSession("replay-1", scenarios.getVoiceScenario("wrong-order")!.fallbackTranscript);
  const replay = await evaluator.evaluateCustomerServiceSession("replay-1", "trainee", broken as never, mastery.scoreApplier);
  assert.equal(replay.judgedBy, "fallback");
  assert.equal(replay.rubric.judgedBy, "fallback");
  const reopened = await evaluator.evaluateCustomerServiceSession("replay-1", "trainee", goodRubric as never, mastery.scoreApplier);
  assert.equal(reopened.reused, true, "a stored result is never regraded");
  assert.equal(reopened.judgedBy, "fallback", "the 'computed rubric' flag survives reopening");
  assert.equal(db.select().from(attempts).all().length, 2);

  console.info("Voice mapping checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
