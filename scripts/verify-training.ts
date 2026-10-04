import assert from "node:assert/strict";

import { judgeAttempt } from "../src/lib/training/judge";
import {
  clampToBand,
  combineScores,
  computeFacts,
  deterministicScores,
  replayEvents,
  speedScore,
  type BuildEvent,
} from "../src/lib/training/scoring";

// Pure logic only: this script never touches a database or the network.
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENAI_USE_VERTEXAI;

const burger = ["Bottom bun", "Bat-wing patty", "Goblin cheese", "Swamp lettuce", "Toadstool slices", "Top bun"];
const adds = (items: string[], step = 2000): BuildEvent[] =>
  items.map((item, i) => ({ type: "add", item, atMs: (i + 1) * step }));

// replay: add, remove, duplicate adds ignored
assert.deepEqual(
  replayEvents([
    { type: "add", item: "A", atMs: 1 },
    { type: "add", item: "B", atMs: 2 },
    { type: "add", item: "A", atMs: 3 },
    { type: "remove", item: "A", atMs: 4 },
    { type: "add", item: "C", atMs: 5 },
  ]),
  ["B", "C"],
);

// perfect and fast
let facts = computeFacts(burger, adds(burger), 12_000, 45);
assert.equal(facts.correctInOrder, 6);
assert.deepEqual([facts.missing, facts.extra, facts.outOfOrder], [[], [], []]);
const scores = deterministicScores(facts);
assert.deepEqual(scores, { accuracy: 1, speed: 1, score: 1 });

// perfect but slow: 90s on a 45s target -> speed 0.5, score 0.75 + 0.25*0.5 = 0.875 -> 0.88
facts = computeFacts(burger, adds(burger), 90_000, 45);
assert.equal(speedScore(90, 45), 0.5);
assert.equal(deterministicScores(facts).score, 0.88);

// missing and extra items
facts = computeFacts(burger, adds(["Bottom bun", "Bat-wing patty", "Ice", "Top bun"]), 10_000, 45);
assert.deepEqual(facts.missing, ["Goblin cheese", "Swamp lettuce", "Toadstool slices"]);
assert.deepEqual(facts.extra, ["Ice"]);
assert.equal(facts.correctInOrder, 3);
assert.ok(deterministicScores(facts).accuracy < 0.6);

// wrong order is detected and partially credited
facts = computeFacts(burger, adds(["Bottom bun", "Goblin cheese", "Bat-wing patty", "Swamp lettuce", "Toadstool slices", "Top bun"]), 10_000, 45);
assert.equal(facts.correctInOrder, 5);
assert.equal(facts.outOfOrder.length, 1);
assert.equal(deterministicScores(facts).accuracy, 0.83);

// empty plate scores zero even though it is "fast"
facts = computeFacts(burger, [], 1_000, 45);
assert.deepEqual(deterministicScores(facts), { accuracy: 0, speed: 0, score: 0 });

// fast but wrong cannot earn speed credit
assert.equal(combineScores(0, 1), 0);

// the LLM can only nudge values inside the band
assert.equal(clampToBand(1, 0.5), 0.65);
assert.equal(clampToBand(0, 0.5), 0.35);
assert.equal(clampToBand(0.55, 0.5), 0.55);
assert.equal(clampToBand(Number.NaN, 0.5), 0.5);

async function main() {
  // no Gemini key -> deterministic fallback, training keeps working
  const perfect = computeFacts(burger, adds(burger), 12_000, 45);
  const judged = await judgeAttempt({ recipeName: "Cauldron Burger", station: "food", facts: perfect, events: adds(burger) });
  assert.equal(judged.source, "fallback");
  assert.equal(judged.score, 1);
  assert.ok(judged.coaching.length > 0);

  const wrong = computeFacts(burger, adds(["Top bun"]), 5_000, 45);
  const judgedWrong = await judgeAttempt({ recipeName: "Cauldron Burger", station: "food", facts: wrong, events: adds(["Top bun"]) });
  assert.equal(judgedWrong.source, "fallback");
  assert.ok(judgedWrong.mistakes.some((m) => m.startsWith("Forgot:")));
  assert.ok(judgedWrong.score < 0.3);

  // The judge never makes a trainee wait past its deadline, and recovers from a quick network blip.
  const input = { recipeName: "Cauldron Burger", station: "food" as const, facts: perfect, events: adds(burger) };
  const good = { accuracy: 1, speed: 1, mistakes: [], coaching: "Great work, keep it up." };

  let started = Date.now();
  const hung = await judgeAttempt(input, () => new Promise(() => {}), 400);
  assert.equal(hung.source, "fallback", "a hanging model falls back");
  assert.ok(Date.now() - started < 1500, "and does so at the deadline, not later");

  let calls = 0;
  const blip = await judgeAttempt(input, (async () => {
    calls++;
    if (calls === 1) throw new Error("fetch failed");
    return good;
  }) as never, 5000);
  assert.equal(calls, 2, "a fast failure is retried once");
  assert.equal(blip.source, "gemini");
  assert.equal(blip.coaching, "Great work, keep it up.");

  calls = 0;
  started = Date.now();
  const down = await judgeAttempt(input, (async () => {
    calls++;
    throw new Error("503 high demand");
  }) as never, 5000);
  assert.equal(down.source, "fallback");
  assert.ok(Date.now() - started < 1500, "a quick failure does not wait out the deadline");

  const wild = await judgeAttempt(input, (async () => ({ accuracy: 0, speed: 0, mistakes: [], coaching: "x" })) as never, 5000);
  assert.equal(wild.accuracy, 0.85, "the model can only move accuracy 0.15 from the computed value");

  console.info("Training scoring checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
