import { describe, expect, test } from "vitest";
import {
  collectVoiceSpikeResponse,
  createInstrumentedVoiceResponse,
  createVoiceSpikeBrain,
  isVoiceSpikeEnabled,
  MAX_VOICE_SPIKE_RESPONSE_CHARS,
  summarizeLatencyRecords,
  toSafeLatencyRecord,
  VoiceSpikeTurnGate,
} from "./index";

class FakeClock {
  value = 0;

  now = () => this.value;

  wait = async (milliseconds: number) => {
    this.value += milliseconds;
  };
}

describe("voice feasibility spike", () => {
  test("streams an instant deterministic Swedish fake response", async () => {
    const clock = new FakeClock();
    const response = createInstrumentedVoiceResponse({
      brain: createVoiceSpikeBrain("instant_fake", clock.wait),
      scenario: "instant_fake",
      deliveryMode: "streamed",
      transcript: "Hej",
      clock,
    });

    await expect(collectVoiceSpikeResponse(response)).resolves.toEqual([
      "Hej! ",
      "Hur kan jag hjälpa dig?",
    ]);
    expect(toSafeLatencyRecord("dev-session-a", response.latency)).toEqual({
      conversationSessionId: "dev-session-a",
      scenario: "instant_fake",
      deliveryMode: "streamed",
      brainFirstChunkMs: 0,
      brainCompleteMs: 0,
      firstTextSentMs: 0,
      finalTextSentMs: 0,
      firstAudioMs: undefined,
    });
  });

  test("streams an acknowledgement before simulated backend delay", async () => {
    const clock = new FakeClock();
    const response = createInstrumentedVoiceResponse({
      brain: createVoiceSpikeBrain("simulated_300", clock.wait),
      scenario: "simulated_300",
      deliveryMode: "streamed",
      transcript: "Har ni en tid?",
      clock,
    });
    const iterator = response.stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: "Jag kollar. ",
    });
    expect(clock.value).toBe(0);
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: "Det simulerade svaret är klart.",
    });
    expect(clock.value).toBe(300);
    await iterator.next();

    expect(toSafeLatencyRecord("dev-session-b", response.latency)).toMatchObject({
      brainFirstChunkMs: 0,
      brainCompleteMs: 300,
      firstTextSentMs: 0,
      finalTextSentMs: 300,
    });
  });

  test("buffers the same simulated work before its first text chunk", async () => {
    const clock = new FakeClock();
    const response = createInstrumentedVoiceResponse({
      brain: createVoiceSpikeBrain("simulated_300", clock.wait),
      scenario: "simulated_300",
      deliveryMode: "buffered",
      transcript: "Har ni en tid?",
      clock,
    });

    await expect(collectVoiceSpikeResponse(response)).resolves.toEqual([
      "Jag kollar. Det simulerade svaret är klart.",
    ]);
    expect(toSafeLatencyRecord("dev-session-c", response.latency)).toMatchObject({
      brainFirstChunkMs: 300,
      brainCompleteMs: 300,
      firstTextSentMs: 300,
      finalTextSentMs: 300,
    });
  });

  test("ignores stale turns and aborts the interrupted active turn", () => {
    const gate = new VoiceSpikeTurnGate();
    const firstSignal = gate.begin(4);
    expect(firstSignal).not.toBeNull();
    expect(gate.isCurrent(4)).toBe(true);

    const secondSignal = gate.begin(5);
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    expect(gate.isCurrent(4)).toBe(false);
    expect(gate.isCurrent(5)).toBe(true);
    expect(gate.begin(4)).toBeNull();

    gate.cancelCurrent();
    expect(secondSignal?.aborted).toBe(true);
    expect(gate.isCurrent(5)).toBe(false);
  });

  test("summarizes P50 and P95 from PII-safe metric records", () => {
    const records = [10, 20, 30, 40, 50].map((brainFirstChunkMs, index) => ({
      conversationSessionId: `dev-session-${index}`,
      scenario: "instant_fake" as const,
      deliveryMode: "streamed" as const,
      brainFirstChunkMs,
    }));

    expect(summarizeLatencyRecords(records)).toEqual([
      expect.objectContaining({
        scenario: "instant_fake",
        deliveryMode: "streamed",
        brainFirstChunkMs: {
          count: 5,
          min: 10,
          p50: 30,
          p95: 50,
          max: 50,
        },
      }),
    ]);
  });

  test("keeps the spike disabled outside explicit development configuration", async () => {
    expect(
      isVoiceSpikeEnabled({ NODE_ENV: "production", VOICE_SPIKE_ENABLED: "true" }),
    ).toBe(false);
    expect(
      isVoiceSpikeEnabled({ NODE_ENV: "development", VOICE_SPIKE_ENABLED: "false" }),
    ).toBe(false);
    expect(
      isVoiceSpikeEnabled({ NODE_ENV: "development", VOICE_SPIKE_ENABLED: "true" }),
    ).toBe(true);

    const response = createInstrumentedVoiceResponse({
      brain: createVoiceSpikeBrain("instant_fake"),
      scenario: "instant_fake",
      deliveryMode: "streamed",
      transcript: "Hej",
    });
    const chunks = await collectVoiceSpikeResponse(response);
    expect(chunks.join("").length).toBeLessThanOrEqual(
      MAX_VOICE_SPIKE_RESPONSE_CHARS,
    );
  });
});
