import { existsSync } from "node:fs";

// Reads .env.local the same way Next does, but never prints any secret value.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type Check = { name: string; run: () => Promise<string> };

const usingVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
const hasCredentials = usingVertex ? Boolean(process.env.GOOGLE_CLOUD_PROJECT) : Boolean(process.env.GEMINI_API_KEY);

function report(label: string, ok: boolean, detail = "") {
  console.info(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  console.info(`Credentials: ${usingVertex ? "Vertex AI (project set: " + hasCredentials + ")" : "Gemini API key (set: " + hasCredentials + ")"}`);
  console.info(`GEMINI_FAST_MODEL set: ${Boolean(process.env.GEMINI_FAST_MODEL)}   GEMINI_PRO_MODEL set: ${Boolean(process.env.GEMINI_PRO_MODEL)}`);
  if (!hasCredentials) {
    console.error("\nNo credentials found. Copy .env.example to .env.local and fill in GEMINI_API_KEY.");
    process.exit(1);
  }

  const llm = await import("../src/lib/llm");

  if (!process.env.GEMINI_FAST_MODEL || !process.env.GEMINI_PRO_MODEL || process.argv.includes("--list-models")) {
    const models = (await llm.listGenerativeModels()).filter((name) => name.startsWith("gemini"));
    console.info("\nGemini models available to this key (pick one fast and one stronger model):");
    for (const name of models) console.info(`  ${name}`);
    if (!process.env.GEMINI_FAST_MODEL || !process.env.GEMINI_PRO_MODEL) {
      console.error("\nSet GEMINI_FAST_MODEL and GEMINI_PRO_MODEL in .env.local, then run this again.");
      process.exit(1);
    }
    return;
  }

  const { judgeAttempt } = await import("../src/lib/training/judge");
  const { computeFacts } = await import("../src/lib/training/scoring");

  const burger = ["Bottom bun", "Bat-wing patty", "Goblin cheese", "Swamp lettuce", "Toadstool slices", "Top bun"];
  const sloppy = ["Bottom bun", "Goblin cheese", "Bat-wing patty", "Top bun"].map((item, i) => ({
    type: "add" as const,
    item,
    atMs: (i + 1) * 4000,
  }));

  const checks: Check[] = [
    {
      name: "structured JSON output",
      run: async () => {
        const out = await llm.generateJsonFromSchema<{ answer: number }>(
          { type: "object", additionalProperties: false, required: ["answer"], properties: { answer: { type: "number" } } },
          "What is 2 + 2? Reply with the number only.",
        );
        if (out.answer !== 4) throw new Error(`expected 4, got ${JSON.stringify(out)}`);
        return "returned {answer: 4}";
      },
    },
    {
      name: "function calling loop",
      run: async () => {
        const result = await llm.runAgent({
          prompt: "What is the secret code of the day? Use the tool, then tell me the code.",
          tools: [
            {
              declaration: {
                name: "get_secret_code",
                description: "Returns today's secret code.",
                parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
              },
              run: () => ({ code: "CAULDRON-7421" }),
            },
          ],
        });
        if (result.toolCalls.length === 0) throw new Error("the model never called the tool");
        if (!result.text.includes("7421")) throw new Error(`reply did not contain the code: ${result.text.slice(0, 80)}`);
        return `${result.toolCalls.length} tool call(s), reply used the result`;
      },
    },
    {
      name: "training judge (real Gemini path, not the fallback)",
      run: async () => {
        const facts = computeFacts(burger, sloppy, 16_000, 45);
        const judged = await judgeAttempt({ recipeName: "Cauldron Burger", station: "food", facts, events: sloppy });
        if (judged.source !== "gemini") throw new Error("judge fell back to deterministic scoring (see the warning above)");
        if (judged.mistakes.length === 0) throw new Error("expected at least one mistake for a sloppy build");
        return `score ${judged.score}, accuracy ${judged.accuracy}, ${judged.mistakes.length} mistake note(s), coaching: "${judged.coaching.slice(0, 70)}..."`;
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    const started = Date.now();
    try {
      const detail = await check.run();
      report(check.name, true, `${detail} (${Date.now() - started} ms)`);
    } catch (error) {
      failed++;
      report(check.name, false, error instanceof Error ? error.message : String(error));
    }
  }
  if (failed) process.exit(1);
  console.info("\nGemini checks passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
