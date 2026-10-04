import assert from "node:assert/strict";

import { applyCorrections, looksLikeMishearing, MAX_CORRECTIONS, similarity } from "../src/voice/corrections";
import { vapiMessageToPartial, vapiMessageToTurn } from "../src/voice/transcript";
import { createScratchDatabase } from "./scratch-db";

// ---- Live view helpers -------------------------------------------------------------------------------------------
assert.deepEqual(vapiMessageToPartial({ type: "transcript", transcriptType: "partial", role: "user", transcript: " I am so sor" }), {
  speaker: "employee",
  text: "I am so sor",
});
assert.equal(vapiMessageToPartial({ type: "transcript", transcriptType: "final", role: "user", transcript: "Hi" }), undefined, "finals are not partials");
assert.equal(vapiMessageToTurn({ type: "transcript", transcriptType: "partial", role: "user", transcript: "Hi" }), undefined, "partials are never stored as turns");
assert.equal(vapiMessageToPartial({ type: "speech-update", role: "user" }), undefined);

// ---- What counts as a mishearing -----------------------------------------------------------------------------------
assert.equal(similarity("Hello there", "hello, there!"), 1, "case and punctuation are ignored");
assert.ok(looksLikeMishearing("I will remake the cider hot at no charge", "I will make the cider hot at no charge"), "one word misheard");
assert.ok(looksLikeMishearing("Man drake mat contains diary", "Mandrake Mac contains dairy"), "sounds-alike words");
assert.ok(!looksLikeMishearing("Uh", "I am so sorry about the cider, I will remake it hot right away and add a free dessert"), "a new answer is not a mishearing");
assert.ok(!looksLikeMishearing("It is cold", "I sincerely apologise and will have the kitchen make a fresh one"), "a different sentence is refused");
assert.ok(!looksLikeMishearing("Hello", "   "), "empty is refused");

const transcript = [
  { speaker: "customer" as const, text: "My Dragon's Breath Cider is cold." },
  { speaker: "employee" as const, text: "I am sorry, I will make the cider hot." },
  { speaker: "customer" as const, text: "How long?" },
  { speaker: "employee" as const, text: "Just a few minuets." },
];

{
  const { transcript: fixed, results } = applyCorrections(transcript, [
    { index: 1, said: "I am sorry, I will remake the cider hot." },
    { index: 0, said: "Pretend the customer said something else" }, // customer line
    { index: 9, said: "nothing" }, // out of range
    { index: 3, said: "Just a few minutes." },
    { index: 3, said: "duplicate index is ignored" },
    "garbage",
    { index: "2", said: "wrong type" },
  ]);
  assert.deepEqual(results.map((r) => [r.index, r.status]), [[1, "applied"], [0, "rejected"], [9, "rejected"], [3, "applied"]]);
  assert.equal(fixed[1].text, "I am sorry, I will remake the cider hot.");
  assert.equal(fixed[3].text, "Just a few minutes.");
  assert.equal(fixed[0].text, transcript[0].text, "the customer's line cannot be changed");
  assert.equal(transcript[1].text, "I am sorry, I will make the cider hot.", "the original array is untouched");
}
{
  const many = Array.from({ length: 6 }, (_, i) => ({ speaker: "employee" as const, text: `I will remake order number ${i}` }));
  const { results } = applyCorrections(many, many.map((turn, index) => ({ index, said: turn.text.replace("remake", "make") })));
  assert.equal(results.filter((r) => r.status === "applied").length, MAX_CORRECTIONS, "at most three lines per call");
  assert.ok(results.slice(MAX_CORRECTIONS).every((r) => /at most/.test(r.reason ?? "")));
}
{
  const { results } = applyCorrections(transcript, [{ index: 1, said: "x".repeat(2000) }]);
  assert.equal(results[0].status, "rejected", "very long input is refused");
}

// ---- Grading with corrections ------------------------------------------------------------------------------------
async function main() {
  await createScratchDatabase("voice-corrections");
  const [{ db }, schema, evaluator, transcriptRoute, evaluateRoute, log, session] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/db/schema"),
    import("../src/voice/evaluator"),
    import("../src/app/api/voice/transcript/route"),
    import("../src/app/api/voice/evaluate/route"),
    import("../src/voice/correction-log"),
    import("../src/lib/session"),
  ]);
  const { callSessions, demoClock, employees } = schema;
  const { eq } = await import("drizzle-orm");
  void evaluateRoute;
  db.insert(demoClock).values({ id: 1, now: "2026-10-03T09:00:00.000Z" }).run();
  db.insert(employees).values({ id: "ann", name: "Ann", role: "employee", isNew: true, hoursCapWeekly: 20 }).run();
  db.insert(employees).values({ id: "bob", name: "Bob", role: "employee", isNew: true, hoursCapWeekly: 20 }).run();

  // The stored transcript has growing fragments, like the real webhook sometimes leaves behind.
  const stored = [
    { speaker: "customer", text: "My Dragon's Breath Cider is cold." },
    { speaker: "employee", text: "I am sorry." },
    { speaker: "employee", text: "I am sorry. I will make the cider hot." },
    { speaker: "customer", text: "How long?" },
    { speaker: "employee", text: "Just a few minuets." },
  ];
  db.insert(callSessions).values({ id: "call-1", employeeId: "ann", scenarioId: "wrong-order", startedAt: "2026-10-03T09:00:00.000Z", transcriptJson: JSON.stringify(stored) }).run();
  db.insert(callSessions).values({ id: "call-empty", employeeId: "ann", scenarioId: "wrong-order", startedAt: "2026-10-03T09:00:00.000Z" }).run();

  const asUser = (id: string, url: string) => new Request(url, { headers: { cookie: `${session.SESSION_COOKIE}=${session.createSessionToken(id)}` } });

  // The review endpoint shows the transcript exactly as it will be graded (fragments merged), with line numbers.
  let reply = (await (await transcriptRoute.GET(asUser("ann", "http://localhost/api/voice/transcript?sessionId=call-1"))).json()) as {
    ready: boolean;
    graded: boolean;
    turns: { index: number; speaker: string; text: string }[];
  };
  assert.equal(reply.ready, true);
  assert.equal(reply.graded, false);
  assert.deepEqual(reply.turns.map((t) => t.index), [0, 1, 2, 3], "four lines after merging the fragments");
  assert.equal(reply.turns[1].text, "I am sorry. I will make the cider hot.");
  assert.equal(((await (await transcriptRoute.GET(asUser("ann", "http://localhost/api/voice/transcript?sessionId=call-empty"))).json()) as { ready: boolean }).ready, false, "not ready before the call report arrives");
  assert.equal((await transcriptRoute.GET(asUser("bob", "http://localhost/api/voice/transcript?sessionId=call-1"))).status, 403, "someone else's call is private");
  assert.equal((await transcriptRoute.GET(new Request("http://localhost/api/voice/transcript?sessionId=call-1"))).status, 401);

  // Grading sees the corrected wording for believable fixes and the original for refused ones.
  let prompt = "";
  const generate = async <T,>(_schema: object, text: string) => {
    prompt = text;
    const dimension = { score: 4, justification: "Good." };
    return {
      greeting_and_warmth: dimension,
      order_accuracy: dimension,
      deescalation_and_empathy: dimension,
      problem_resolution: dimension,
      professional_tone: dimension,
      upsell_or_suggestion: dimension,
    } as T;
  };
  const applied: unknown[] = [];
  const result = await evaluator.evaluateCustomerServiceSession("call-1", "ann", generate, (...args) => void applied.push(args), [
    { index: 1, said: "I am sorry. I will remake the cider hot." },
    { index: 3, said: "I have booked you a free three-course dinner and a refund of everything you ever paid us" },
  ]);
  assert.equal(result.corrections.length, 2);
  assert.equal(result.corrections[0].status, "applied");
  assert.equal(result.corrections[1].status, "rejected");
  assert.match(prompt, /EMPLOYEE: I am sorry\. I will remake the cider hot\./, "the accepted fix is what the grader reads");
  assert.match(prompt, /EMPLOYEE: Just a few minuets\./, "the refused fix is not used");
  assert.match(prompt, /corrected them/, "the grader is told a line was corrected");
  assert.doesNotMatch(prompt, /free three-course/, "refused text never reaches the grader");
  assert.equal(applied.length, 1, "mastery updated once");

  // The original transcript is kept for the record; the fixes are logged for the manager.
  const row = db.select().from(callSessions).where(eq(callSessions.id, "call-1")).get()!;
  assert.deepEqual(JSON.parse(row.transcriptJson!), stored, "the stored transcript is never rewritten");
  const logged = log.listCorrections("ann");
  assert.deepEqual(logged.map((c) => c.status), ["applied", "rejected"]);
  assert.match(logged[0].scenario, /Cold/);

  // Grading again returns the saved result and does not grade or change anything.
  prompt = "";
  const again = await evaluator.evaluateCustomerServiceSession("call-1", "ann", generate, (...args) => void applied.push(args), [{ index: 3, said: "Just a few minutes." }]);
  assert.equal(again.reused, true);
  assert.equal(prompt, "", "no second grading");
  assert.equal(again.corrections.length, 2, "late fixes cannot change a graded call");
  assert.equal(applied.length, 1);

  // After grading the review endpoint shows the corrected wording with the original beside it.
  reply = (await (await transcriptRoute.GET(asUser("ann", "http://localhost/api/voice/transcript?sessionId=call-1"))).json()) as typeof reply;
  assert.equal(reply.graded, true);
  assert.equal(reply.turns[1].text, "I am sorry. I will remake the cider hot.");
  assert.equal((reply.turns[1] as { originalText?: string }).originalText, "I am sorry. I will make the cider hot.");
  assert.equal((reply.turns[3] as { originalText?: string }).originalText, undefined, "refused fix: no change shown");

  // A call graded with no fixes behaves as before.
  db.insert(callSessions).values({ id: "call-2", employeeId: "ann", scenarioId: "wrong-order", startedAt: "2026-10-03T10:00:00.000Z", transcriptJson: JSON.stringify(stored) }).run();
  const plain = await evaluator.evaluateCustomerServiceSession("call-2", "ann", generate, () => undefined);
  assert.deepEqual(plain.corrections, []);
  assert.doesNotMatch(prompt, /corrected them/);

  console.info("Voice correction checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
