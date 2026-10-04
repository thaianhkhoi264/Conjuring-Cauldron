import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type Schema,
} from "@google/genai";

/**
 * Shared Gemini client for Agent A (voice scoring) and Agent B (judging,
 * scheduler agent, chatbot). Uses Vertex AI when GOOGLE_GENAI_USE_VERTEXAI=true,
 * otherwise a Gemini API key.
 */
let client: GoogleGenAI | undefined;

function getClient() {
  if (client) return client;
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true") {
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    });
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example).");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function modelFor(tier: "fast" | "pro") {
  const model = tier === "pro" ? process.env.GEMINI_PRO_MODEL : process.env.GEMINI_FAST_MODEL;
  if (!model) throw new Error(`Set ${tier === "pro" ? "GEMINI_PRO_MODEL" : "GEMINI_FAST_MODEL"} (see .env.example).`);
  return model;
}

export type GenerateJsonOptions = {
  prompt: string;
  schema: Schema;
  system?: string;
  tier?: "fast" | "pro";
  temperature?: number;
};

/** One-shot structured output. Returns the parsed JSON; callers validate and clamp. */
export async function generateJson<T>({
  prompt,
  schema,
  system,
  tier = "fast",
  temperature = 0,
}: GenerateJsonOptions): Promise<T> {
  const response = await getClient().models.generateContent({
    model: modelFor(tier),
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(text) as T;
}

/**
 * Adapter matching Agent A's `JsonGenerator` signature (plain JSON Schema + prompt).
 * Uses `responseJsonSchema`, which accepts standard JSON Schema such as `additionalProperties`.
 */
export async function generateJsonFromSchema<T>(
  schema: object,
  prompt: string,
  options: { timeoutMs?: number; thinking?: Thinking } = {},
): Promise<T> {
  const response = await getClient().models.generateContent({
    model: modelFor("fast"),
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      // A hung connection otherwise sits for ~10 s before failing; callers that must stay snappy pass a limit.
      ...(options.timeoutMs ? { abortSignal: AbortSignal.timeout(options.timeoutMs) } : {}),
      ...(options.thinking ? { thinkingConfig: thinkingConfig(options.thinking) } : {}),
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(text) as T;
}

export type AgentTool = {
  declaration: FunctionDeclaration;
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

/** How much the model "thinks" before answering. Lower is much faster; chat and tool loops use "minimal". */
export type Thinking = "minimal" | "low";

function thinkingConfig(thinking: Thinking | undefined) {
  if (!thinking) return undefined;
  return { thinkingLevel: thinking === "minimal" ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
}

export type RunAgentOptions = {
  prompt: string;
  tools: AgentTool[];
  system?: string;
  history?: Content[];
  tier?: "fast" | "pro";
  maxSteps?: number;
  thinking?: Thinking;
};

export type AgentResult = {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[];
  history: Content[];
};

/** Function-calling loop: run tools until the model answers in plain text. */
export async function runAgent({
  prompt,
  tools,
  system,
  history = [],
  tier = "fast",
  maxSteps = 8,
  thinking,
}: RunAgentOptions): Promise<AgentResult> {
  const byName = new Map(tools.map((tool) => [tool.declaration.name, tool]));
  const contents: Content[] = [...history, { role: "user", parts: [{ text: prompt }] }];
  const toolCalls: AgentResult["toolCalls"] = [];

  for (let step = 0; step < maxSteps; step++) {
    const response = await getClient().models.generateContent({
      model: modelFor(tier),
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: tools.map((tool) => tool.declaration) }],
        thinkingConfig: thinkingConfig(thinking),
      },
    });

    const calls = response.functionCalls ?? [];
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    if (calls.length === 0) {
      return { text: response.text ?? "", toolCalls, history: contents };
    }

    const parts = [];
    for (const call of calls) {
      const tool = byName.get(call.name ?? "");
      const args = (call.args ?? {}) as Record<string, unknown>;
      let result: unknown;
      try {
        result = tool ? await tool.run(args) : { error: `Unknown tool ${call.name}` };
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      toolCalls.push({ name: call.name ?? "", args, result });
      parts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
  }

  throw new Error(`Agent did not finish within ${maxSteps} steps.`);
}

/** Model ids the configured key can call for text generation. Used by `npm run verify:llm`. */
export async function listGenerativeModels(): Promise<string[]> {
  const pager = await getClient().models.list({ config: { pageSize: 100 } });
  const names: string[] = [];
  for await (const model of pager) {
    const actions = model.supportedActions ?? [];
    if (model.name && (actions.length === 0 || actions.includes("generateContent"))) {
      names.push(model.name.replace(/^models\//, ""));
    }
  }
  return names.sort();
}

/** Thrown by `runAgentResilient` when no configured model could answer in time. */
export class LlmUnavailableError extends Error {
  constructor(readonly kind: "rate-limit" | "unavailable", detail: string) {
    super(detail);
    this.name = "LlmUnavailableError";
  }
}

function isTransientLlmError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /"code":\s*(429|500|502|503|504)|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|timed out/i.test(text);
}

/**
 * `runAgent` with a time limit per attempt and a second try on the other configured model.
 * Throws `LlmUnavailableError` (never a raw API error) when the models are busy, slow or over quota.
 * Errors that look like bugs are rethrown unchanged.
 */
export async function runAgentResilient(options: Omit<RunAgentOptions, "tier"> & { timeoutMs?: number }): Promise<AgentResult> {
  const { timeoutMs = 30_000, ...rest } = options;
  const tiers = ["fast", "pro"] as const;
  let last: unknown;

  for (const tier of tiers) {
    try {
      return await new Promise<AgentResult>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for the model.")), timeoutMs);
        runAgent({ ...rest, tier }).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
    } catch (error) {
      last = error;
      if (!isTransientLlmError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  const detail = last instanceof Error ? last.message : String(last);
  throw new LlmUnavailableError(/"code":\s*429|RESOURCE_EXHAUSTED|quota/i.test(detail) ? "rate-limit" : "unavailable", detail.slice(0, 300));
}
