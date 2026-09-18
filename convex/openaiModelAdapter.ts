import type {
  Finalization,
  ModelAdapter,
  ModelGenerationInput,
  ModelOutput,
} from "./modelAdapter";
import { record } from "./groundedResponse";
import { parseModelToolRequest } from "./orchestratorCore";

export class ModelProviderError extends Error {
  constructor(
    readonly code:
      "configuration" | "timeout" | "provider_error" | "malformed_response",
  ) {
    super(`AI provider: ${code}`);
  }
}
const string = { type: "string" };
const integer = { type: "integer" };
const toolShapes: Record<
  string,
  { required: Record<string, unknown>; optional?: Record<string, unknown> }
> = {
  "knowledge.search": {
    required: { query: string },
    optional: { limit: integer },
  },
  "customer.find": {
    required: {
      by: { type: "string", enum: ["email", "phone", "name"] },
      value: string,
    },
    optional: { limit: integer },
  },
  "service.list": { required: {} },
  "availability.check": { required: { startTime: integer, endTime: integer } },
  "business.profile": { required: {} },
  "business.hours": { required: {} },
  "booking.create": {
    required: {
      customerId: string,
      serviceId: string,
      startTime: integer,
      endTime: integer,
    },
    optional: { notes: string },
  },
  "booking.reschedule": {
    required: { bookingId: string, startTime: integer, endTime: integer },
  },
  "booking.cancel": { required: { bookingId: string } },
  "case.create": {
    required: { title: string },
    optional: {
      customerId: string,
      description: string,
      priority: { type: "string", enum: ["low", "normal", "high"] },
    },
  },
  "human.escalate": { required: { reason: string } },
};
const finalKinds = [
  "unknown",
  "clarify_service",
  "clarify_time",
  "clarify_customer",
  "knowledge",
  "services",
  "availability",
] as const;
const finalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: finalKinds },
    resultIndex: { type: ["integer", "null"] },
  },
  required: ["kind", "resultIndex"],
};
const wireName = (name: string) => name.replaceAll(".", "_");

/** Strict provider normalization happens before the independent domain parser. */
export function normalizeOpenAIOutput(value: unknown): {
  output: ModelOutput;
  callId?: string;
  replay: unknown[];
} {
  const response = record(value);
  if (
    response?.status !== "completed" ||
    !Array.isArray(response.output) ||
    response.output.length > 16
  )
    throw new ModelProviderError("malformed_response");
  const items = response.output.map(record);
  if (
    items.some(
      (item) =>
        !item ||
        !["reasoning", "function_call", "message"].includes(String(item.type)),
    )
  )
    throw new ModelProviderError("malformed_response");
  const meaningful = items.filter((item) => item?.type !== "reasoning");
  if (meaningful.length !== 1)
    throw new ModelProviderError("malformed_response");
  const item = meaningful[0]!;
  if (item.type === "function_call") {
    if (
      typeof item.name !== "string" ||
      typeof item.call_id !== "string" ||
      !item.call_id ||
      item.call_id.length > 200 ||
      typeof item.arguments !== "string" ||
      item.arguments.length > 32_000
    )
      throw new ModelProviderError("malformed_response");
    const name = Object.keys(toolShapes).find(
      (name) => wireName(name) === item.name,
    );
    if (!name) throw new ModelProviderError("malformed_response");
    let args: Record<string, unknown> | null;
    try {
      args = record(JSON.parse(item.arguments));
    } catch {
      throw new ModelProviderError("malformed_response");
    }
    if (!args) throw new ModelProviderError("malformed_response");
    for (const key of Object.keys(toolShapes[name].optional ?? {}))
      if (args[key] === null) delete args[key];
    const parsed = parseModelToolRequest({ toolName: name, args });
    if (!parsed.ok) throw new ModelProviderError("malformed_response");
    return {
      output: { kind: "tool_request", ...parsed.request },
      callId: item.call_id,
      replay: response.output,
    };
  }
  if (!Array.isArray(item.content) || item.content.length !== 1)
    throw new ModelProviderError("malformed_response");
  const part = record(item.content[0]);
  if (
    part?.type !== "output_text" ||
    typeof part.text !== "string" ||
    part.text.length > 4000
  )
    throw new ModelProviderError("malformed_response");
  let final: Record<string, unknown> | null;
  try {
    final = record(JSON.parse(part.text));
  } catch {
    throw new ModelProviderError("malformed_response");
  }
  if (
    !final ||
    Object.keys(final).length !== 2 ||
    !finalKinds.includes(final.kind as (typeof finalKinds)[number]) ||
    !(
      final.resultIndex === null ||
      (typeof final.resultIndex === "number" &&
        Number.isInteger(final.resultIndex) &&
        final.resultIndex >= 0 &&
        final.resultIndex < 5)
    )
  )
    throw new ModelProviderError("malformed_response");
  return {
    output: {
      kind: "final",
      content: "structured",
      finalization: {
        kind: final.kind as Finalization["kind"],
        ...(final.resultIndex === null
          ? {}
          : { resultIndex: final.resultIndex as number }),
      },
    },
    replay: [],
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new ModelProviderError("malformed_response");
  const reader = response.body.getReader();
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 128_000) throw new ModelProviderError("malformed_response");
      text += decoder.decode(chunk.value, { stream: true });
    }
    try {
      return JSON.parse(text + decoder.decode()) as unknown;
    } catch {
      throw new ModelProviderError("malformed_response");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** One instance per authenticated turn. No retries, provider storage, or logging. */
export class OpenAIModelAdapter implements ModelAdapter {
  readonly metadata;
  private history: unknown[] = [];
  private pendingCallId: string | undefined;
  private resultCount = 0;
  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      timeoutMs: number;
    },
    private readonly transport: typeof fetch = fetch,
  ) {
    this.metadata = {
      provider: "openai",
      model: config.model,
      mode: "live" as const,
    };
    if (
      !config.apiKey.trim() ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(config.model) ||
      !Number.isInteger(config.timeoutMs) ||
      config.timeoutMs < 1 ||
      config.timeoutMs > 60_000
    )
      throw new ModelProviderError("configuration");
  }
  async generate(input: ModelGenerationInput): Promise<ModelOutput> {
    if (!this.history.length) {
      // Even stored system/human/AI messages are data, never provider system authority.
      this.history.push({
        role: "user",
        content: JSON.stringify({
          conversation: input.conversation,
          messages: input.messages,
        }),
      });
    }
    if (this.pendingCallId) {
      if (input.toolResults.length !== this.resultCount + 1)
        throw new ModelProviderError("malformed_response");
      this.history.push({
        type: "function_call_output",
        call_id: this.pendingCallId,
        output: JSON.stringify(input.toolResults.at(-1)?.result),
      });
      this.pendingCallId = undefined;
      this.resultCount = input.toolResults.length;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = async () => {
        const response = await this.transport(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
              model: this.config.model,
              store: false,
              max_output_tokens: 2000,
              parallel_tool_calls: false,
              include: ["reasoning.encrypted_content"],
              instructions: `${input.systemInstruction} Return only a structured finalization: choose unknown, clarify_service, clarify_time, clarify_customer, knowledge, services, or availability. Evidence resultIndex is the zero-based tool result index in this turn (null for questions/unknown). Knowledge is quoted; use services for all pricing questions. Do not invent identifiers. At most one write is permitted per turn; the server composes its confirmation.`,
              input: this.history,
              tools: input.toolDefinitions.map((definition) => {
                const shape = toolShapes[definition.name];
                if (!shape) throw new ModelProviderError("configuration");
                const properties = {
                  ...shape.required,
                  ...Object.fromEntries(
                    Object.entries(shape.optional ?? {}).map(
                      ([key, schema]) => [
                        key,
                        { anyOf: [schema, { type: "null" }] },
                      ],
                    ),
                  ),
                };
                return {
                  type: "function",
                  name: wireName(definition.name),
                  description: definition.description,
                  strict: true,
                  parameters: {
                    type: "object",
                    properties,
                    required: Object.keys(properties),
                    additionalProperties: false,
                  },
                };
              }),
              text: {
                format: {
                  type: "json_schema",
                  name: "service_desk_final",
                  strict: true,
                  schema: finalSchema,
                },
              },
            }),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new ModelProviderError("provider_error");
        }
        return normalizeOpenAIOutput(await boundedJson(response));
      };
      const normalized = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ModelProviderError("timeout"));
          }, this.config.timeoutMs);
        }),
      ]);
      this.history.push(...normalized.replay);
      this.pendingCallId = normalized.callId;
      return normalized.output;
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      throw new ModelProviderError(
        controller.signal.aborted ? "timeout" : "provider_error",
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
