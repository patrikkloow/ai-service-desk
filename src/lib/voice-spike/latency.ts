import type {
  VoiceBrain,
  VoiceSpikeDeliveryMode,
  VoiceSpikeScenario,
} from "./voice-brain";

export type MonotonicClock = { now(): number };

export const systemMonotonicClock: MonotonicClock = {
  now: () => performance.now(),
};

export type VoiceTurnLatency = {
  scenario: VoiceSpikeScenario;
  deliveryMode: VoiceSpikeDeliveryMode;
  transcriptReceivedAtMs: number;
  brainProcessingStartedAtMs: number;
  firstBrainChunkAtMs?: number;
  brainCompleteAtMs?: number;
  firstTextSentAtMs?: number;
  finalTextSentAtMs?: number;
  firstAudioAtMs?: number;
};

export type SafeLatencyRecord = {
  conversationSessionId: string;
  scenario: VoiceSpikeScenario;
  deliveryMode: VoiceSpikeDeliveryMode;
  brainFirstChunkMs?: number;
  brainCompleteMs?: number;
  firstTextSentMs?: number;
  finalTextSentMs?: number;
  firstAudioMs?: number;
};

export type InstrumentedVoiceResponse = {
  latency: VoiceTurnLatency;
  stream: AsyncIterable<string>;
};

export function createInstrumentedVoiceResponse(input: {
  brain: VoiceBrain;
  scenario: VoiceSpikeScenario;
  deliveryMode: VoiceSpikeDeliveryMode;
  transcript: string;
  signal?: AbortSignal;
  clock?: MonotonicClock;
  sendChunk?: (chunk: string) => void | Promise<void>;
}): InstrumentedVoiceResponse {
  const clock = input.clock ?? systemMonotonicClock;
  const transcriptReceivedAtMs = clock.now();
  const latency: VoiceTurnLatency = {
    scenario: input.scenario,
    deliveryMode: input.deliveryMode,
    transcriptReceivedAtMs,
    brainProcessingStartedAtMs: clock.now(),
  };

  return {
    latency,
    stream: (async function* () {
      for await (const chunk of input.brain.stream({
        transcript: input.transcript,
        deliveryMode: input.deliveryMode,
        signal: input.signal,
      })) {
        const chunkAtMs = clock.now();
        latency.firstBrainChunkAtMs ??= chunkAtMs;
        await input.sendChunk?.(chunk);
        latency.firstTextSentAtMs ??= clock.now();
        latency.finalTextSentAtMs = clock.now();
        yield chunk;
      }
      latency.brainCompleteAtMs = clock.now();
      latency.finalTextSentAtMs ??= latency.brainCompleteAtMs;
    })(),
  };
}

export async function collectVoiceSpikeResponse(
  response: InstrumentedVoiceResponse,
): Promise<Array<string>> {
  const chunks: Array<string> = [];
  for await (const chunk of response.stream) chunks.push(chunk);
  return chunks;
}

export function markFirstAudio(
  latency: VoiceTurnLatency,
  clock: MonotonicClock = systemMonotonicClock,
): void {
  latency.firstAudioAtMs ??= clock.now();
}

function elapsed(
  eventAtMs: number | undefined,
  transcriptReceivedAtMs: number,
): number | undefined {
  return eventAtMs === undefined
    ? undefined
    : Math.max(0, eventAtMs - transcriptReceivedAtMs);
}

/** Excludes transcript, headers, prompts, and any customer identifiers. */
export function toSafeLatencyRecord(
  conversationSessionId: string,
  latency: VoiceTurnLatency,
): SafeLatencyRecord {
  return {
    conversationSessionId,
    scenario: latency.scenario,
    deliveryMode: latency.deliveryMode,
    brainFirstChunkMs: elapsed(
      latency.firstBrainChunkAtMs,
      latency.transcriptReceivedAtMs,
    ),
    brainCompleteMs: elapsed(
      latency.brainCompleteAtMs,
      latency.transcriptReceivedAtMs,
    ),
    firstTextSentMs: elapsed(
      latency.firstTextSentAtMs,
      latency.transcriptReceivedAtMs,
    ),
    finalTextSentMs: elapsed(
      latency.finalTextSentAtMs,
      latency.transcriptReceivedAtMs,
    ),
    firstAudioMs: elapsed(latency.firstAudioAtMs, latency.transcriptReceivedAtMs),
  };
}

export type PercentileSummary = {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
};

export type LatencySummary = {
  scenario: VoiceSpikeScenario;
  deliveryMode: VoiceSpikeDeliveryMode;
  brainFirstChunkMs?: PercentileSummary;
  brainCompleteMs?: PercentileSummary;
  firstTextSentMs?: PercentileSummary;
  finalTextSentMs?: PercentileSummary;
  firstAudioMs?: PercentileSummary;
};

function summarize(values: Array<number | undefined>): PercentileSummary | undefined {
  const sorted = values
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return undefined;
  const percentile = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;

  return {
    count: sorted.length,
    min: sorted[0]!,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1)!,
  };
}

export function summarizeLatencyRecords(
  records: Array<SafeLatencyRecord>,
): Array<LatencySummary> {
  const groups = new Map<string, Array<SafeLatencyRecord>>();
  for (const record of records) {
    const key = `${record.scenario}:${record.deliveryMode}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.values()].map((group) => ({
    scenario: group[0]!.scenario,
    deliveryMode: group[0]!.deliveryMode,
    brainFirstChunkMs: summarize(group.map((record) => record.brainFirstChunkMs)),
    brainCompleteMs: summarize(group.map((record) => record.brainCompleteMs)),
    firstTextSentMs: summarize(group.map((record) => record.firstTextSentMs)),
    finalTextSentMs: summarize(group.map((record) => record.finalTextSentMs)),
    firstAudioMs: summarize(group.map((record) => record.firstAudioMs)),
  }));
}
