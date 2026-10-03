import assert from "node:assert/strict";

import { POST as createVoiceSession } from "../src/app/api/voice/session/route";
import { POST as receiveVoiceWebhook } from "../src/app/api/voice/webhook/route";
import { db } from "../src/lib/db";
import { callSessions, employees } from "../src/lib/db/schema";
import { getFallbackCallTranscript } from "../src/voice/fallback-call";

async function requestJson(url: string, body: unknown, headers?: HeadersInit) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

async function main() {
  db.delete(callSessions).run();
  db.delete(employees).run();
  db.insert(employees).values({ id: "voice-test-employee", name: "Voice Test", role: "employee", isNew: true, hoursCapWeekly: 20 }).run();

  const invalidScenario = await createVoiceSession(await requestJson("http://localhost/api/voice/session", { employeeId: "voice-test-employee", scenarioId: "invalid" }));
  assert.equal(invalidScenario.status, 400, "invalid scenarios must be rejected");

  const sessionResponse = await createVoiceSession(await requestJson("http://localhost/api/voice/session", { employeeId: "voice-test-employee", scenarioId: "wrong-order" }));
  assert.equal(sessionResponse.status, 200, "valid voice sessions must start");
  const session = await sessionResponse.json() as { sessionId: string; vapi: { mode: string } };
  assert.equal(session.vapi.mode, "demo", "missing Vapi credentials must fall back safely");

  process.env.VAPI_WEBHOOK_SECRET = "test-secret";
  const rejectedWebhook = await receiveVoiceWebhook(await requestJson("http://localhost/api/voice/webhook", { callSessionId: session.sessionId }));
  assert.equal(rejectedWebhook.status, 401, "protected webhooks must reject missing secrets");

  const completedWebhook = await receiveVoiceWebhook(await requestJson("http://localhost/api/voice/webhook", {
    callSessionId: session.sessionId,
    message: { type: "end-of-call-report", artifact: { messages: getFallbackCallTranscript().map((turn) => ({ role: turn.speaker === "customer" ? "user" : "assistant", message: turn.text })) } },
  }, { "x-conjuring-voice-secret": "test-secret" }));
  assert.equal(completedWebhook.status, 200, "valid completed calls must be stored");

  const stored = db.select().from(callSessions).get();
  assert.ok(stored?.endedAt, "ended calls require a completion timestamp");
  assert.equal(JSON.parse(stored?.transcriptJson ?? "[]").length, getFallbackCallTranscript().length, "stored transcript must preserve all turns");
  delete process.env.VAPI_WEBHOOK_SECRET;
  console.info("Voice lifecycle checks passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
