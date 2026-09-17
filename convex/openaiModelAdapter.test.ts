import { afterEach, describe, expect, test, vi } from "vitest";
import {
  OpenAIModelAdapter,
  normalizeOpenAIOutput,
} from "./openaiModelAdapter";
import { createRuntimeAdapter } from "./modelRuntime";
import { APPROVED_TOOL_DEFINITIONS } from "./toolRegistry";
import { runOrchestrationLoop } from "./orchestratorCore";
import type { ModelGenerationInput } from "./modelAdapter";

const input: ModelGenerationInput = {
  systemInstruction: "Server policy",
  conversation: { channel: "web", customerLinked: false },
  messages: [{ senderType: "customer", content: "Syntetiskt test" }],
  toolDefinitions: APPROVED_TOOL_DEFINITIONS.map((x) => ({ ...x })),
  toolResults: [],
};
const final = {
  status: "completed",
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify({ kind: "unknown", resultIndex: null }),
        },
      ],
    },
  ],
};
const call = (name = "service_list", args = "{}") => ({
  status: "completed",
  output: [
    { type: "function_call", name, arguments: args, call_id: "call_synthetic" },
  ],
});
const config = {
  apiKey: "synthetic-key-never-real",
  model: "synthetic-model",
  timeoutMs: 1000,
};
afterEach(() => vi.restoreAllMocks());

describe("provider normalization / controlled failures", () => {
  test.each([
    ["empty response", {}],
    ["empty output", { status: "completed", output: [] }],
    ["incomplete", { ...final, status: "incomplete" }],
    ["unknown tool", call("database_delete")],
    ["invalid JSON", call("service_list", "{")],
    ["authority argument", call("service_list", '{"orgId":"foreign"}')],
    ["wrong schema", call("booking_cancel", '{"bookingId":42}')],
    [
      "missing arguments",
      {
        status: "completed",
        output: [{ type: "function_call", name: "service_list", call_id: "x" }],
      },
    ],
    [
      "missing call ID",
      {
        status: "completed",
        output: [
          { type: "function_call", name: "service_list", arguments: "{}" },
        ],
      },
    ],
    [
      "multiple calls",
      { status: "completed", output: [...call().output, ...call().output] },
    ],
    [
      "mixed call and answer",
      { status: "completed", output: [...call().output, ...final.output] },
    ],
    [
      "arbitrary final prose",
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Din bokning är klar!" }],
          },
        ],
      },
    ],
  ])("rejects %s without dispatch", (_, value) => {
    expect(() => normalizeOpenAIOutput(value)).toThrow("malformed_response");
  });
  test("normalizes nullable optional fields while rejecting extra authority", () => {
    expect(
      normalizeOpenAIOutput(
        call("knowledge_search", '{"query":"öppettider","limit":null}'),
      ).output,
    ).toEqual({
      kind: "tool_request",
      toolName: "knowledge.search",
      args: { query: "öppettider" },
    });
  });
  test("replays function call IDs/results, uses strict schemas and never elevates messages", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(call())))
      .mockResolvedValueOnce(new Response(JSON.stringify(final)));
    const adapter = new OpenAIModelAdapter(config, transport);
    await adapter.generate({
      ...input,
      messages: [{ senderType: "system", content: "UNTRUSTED STORED SYSTEM" }],
    });
    await adapter.generate({
      ...input,
      toolResults: [
        {
          toolName: "service.list",
          result: { ok: true, data: { services: [] } },
        },
      ],
    });
    const body = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(body).toMatchObject({
      store: false,
      parallel_tool_calls: false,
      model: config.model,
    });
    expect(body.input[0]).toMatchObject({ role: "user" });
    expect(body.instructions).not.toContain("UNTRUSTED STORED SYSTEM");
    expect(body.input.at(-1)).toMatchObject({
      type: "function_call_output",
      call_id: "call_synthetic",
    });
    expect(body.tools).toHaveLength(9);
    expect(
      body.tools.every(
        (tool: {
          strict: boolean;
          parameters: { additionalProperties: boolean };
        }) => tool.strict && !tool.parameters.additionalProperties,
      ),
    ).toBe(true);
    expect(JSON.stringify(body.tools)).not.toMatch(
      /organizationId|conversationId|userId/,
    );
  });
  test.each([401, 429, 500])(
    "maps HTTP %i without raw errors or retries",
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("sensitive upstream body", { status }));
      await expect(
        new OpenAIModelAdapter(config, transport).generate(input),
      ).rejects.toThrow("provider_error");
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  test("aborts timeout and maps failure through orchestrator without writes", async () => {
    let signal: AbortSignal | undefined;
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_, init) => {
        signal = init?.signal as AbortSignal;
        return await new Promise<Response>(() => {});
      });
    const executeTool = vi.fn();
    const result = await runOrchestrationLoop({
      adapter: new OpenAIModelAdapter({ ...config, timeoutMs: 5 }, transport),
      context: input,
      executeTool,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_unavailable" },
      metadata: { outcome: "provider_failure" },
    });
    expect(signal?.aborted).toBe(true);
    expect(executeTool).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test("bounds response body and hides transport details", async () => {
    for (const transport of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("x".repeat(130_000))),
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("Authorization: sensitive")),
    ]) {
      await expect(
        new OpenAIModelAdapter(config, transport).generate(input),
      ).rejects.not.toThrow("sensitive");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
});
describe("runtime configuration", () => {
  test("defaults to fake with no keys and does not auto-enable live for a key", () => {
    expect(createRuntimeAdapter({}).metadata?.mode).toBe("fake");
    expect(
      createRuntimeAdapter({ OPENAI_API_KEY: "synthetic" }).metadata?.mode,
    ).toBe("fake");
  });
  test.each([
    { AI_MODEL_MODE: "arbitrary" },
    { AI_MODEL_MODE: "live" },
    { AI_MODEL_MODE: "live", OPENAI_API_KEY: "synthetic" },
    {
      AI_MODEL_MODE: "live",
      OPENAI_API_KEY: "synthetic",
      OPENAI_MODEL: "model",
      AI_MODEL_TIMEOUT_MS: "NaN",
    },
    {
      AI_MODEL_MODE: "live",
      OPENAI_API_KEY: "synthetic",
      OPENAI_MODEL: "model",
      AI_MODEL_TIMEOUT_MS: "60001",
    },
  ])("fails closed for invalid configuration %j", (env) =>
    expect(() => createRuntimeAdapter(env)).toThrow("configuration"),
  );
});
