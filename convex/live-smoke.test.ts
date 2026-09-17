import { expect, test } from "vitest";
import { OpenAIModelAdapter } from "./openaiModelAdapter";
import { runOrchestrationLoop } from "./orchestratorCore";

test.skipIf(process.env.AI_LIVE_SMOKE !== "1")(
  "optional live Swedish pricing smoke (synthetic, read-only)",
  async () => {
    const adapter = new OpenAIModelAdapter({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model: process.env.OPENAI_MODEL ?? "",
      timeoutMs: 20_000,
    });
    const result = await runOrchestrationLoop({
      adapter,
      context: {
        conversation: { channel: "web", customerLinked: false },
        messages: [
          { senderType: "customer", content: "Vad kostar rådgivning hos er?" },
        ],
      },
      executeTool: async (request) => ({
        kind: "completed",
        result:
          request.toolName === "service.list"
            ? {
                ok: true,
                data: {
                  services: [
                    {
                      name: "Rådgivning",
                      pricing: {
                        kind: "fixed",
                        amountMinor: 49500,
                        currency: "SEK",
                      },
                    },
                  ],
                },
              }
            : {
                ok: false,
                error: {
                  code: "unavailable",
                  message: "Smoke supports read-only service data.",
                },
              },
      }),
    });
    expect(
      result.ok,
      "Live provider must complete the read-only scenario",
    ).toBe(true);
    if (result.ok)
      expect(
        result.response.includes("495 SEK"),
        "Must cite the structured synthetic price",
      ).toBe(true);
    expect(
      result.executedTools.some((tool) => tool.kind === "write"),
      "Must not attempt writes",
    ).toBe(false);
    console.info(
      `Live smoke: ${adapter.metadata.provider}/${adapter.metadata.model}, ${result.metadata.outcome}, ${result.metadata.latencyMs} ms`,
    );
  },
  130_000,
);
