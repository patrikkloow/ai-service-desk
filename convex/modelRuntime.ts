import { DevelopmentFakeModelAdapter, type ModelAdapter } from "./modelAdapter";
import { ModelProviderError, OpenAIModelAdapter } from "./openaiModelAdapter";

// Server-only configuration, following the repository's existing process.env pattern.
// No caller-supplied provider, model, endpoint, prompt, or key is accepted.
export function createRuntimeAdapter(
  env: Record<string, string | undefined> = process.env,
): ModelAdapter {
  if (!env.AI_MODEL_MODE || env.AI_MODEL_MODE === "fake")
    return new DevelopmentFakeModelAdapter();
  if (env.AI_MODEL_MODE !== "live" || !env.OPENAI_API_KEY || !env.OPENAI_MODEL)
    throw new ModelProviderError("configuration");
  const timeoutMs =
    env.AI_MODEL_TIMEOUT_MS === undefined
      ? 20_000
      : Number(env.AI_MODEL_TIMEOUT_MS);
  if (timeoutMs < 1000) throw new ModelProviderError("configuration");
  return new OpenAIModelAdapter({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    timeoutMs,
  });
}
