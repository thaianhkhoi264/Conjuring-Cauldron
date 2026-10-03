import { buildVoiceSystemPrompt, type VoiceScenario } from "./scenarios";

export type VapiSessionConfig = {
  mode: "live" | "demo";
  publicKey?: string;
  assistantId?: string;
  assistantOverrides?: {
    variableValues: Record<string, string>;
  };
};

/**
 * Configuration consumed by the browser Vapi client. A saved assistant keeps
 * the model, voice, and webhook secret out of the client bundle.
 */
export function createVapiSessionConfig(sessionId: string, scenario: VoiceScenario): VapiSessionConfig {
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!publicKey || !assistantId) return { mode: "demo" };

  return {
    mode: "live",
    publicKey,
    assistantId,
    assistantOverrides: {
      variableValues: {
        callSessionId: sessionId,
        scenarioId: scenario.id,
        customerName: scenario.customerName,
      },
    },
  };
}

/** Paste this into the saved Vapi assistant's Gemini system prompt. */
export function getVapiAssistantPrompt(scenario: VoiceScenario) {
  return buildVoiceSystemPrompt(scenario);
}
