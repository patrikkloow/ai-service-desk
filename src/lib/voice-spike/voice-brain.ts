export const VOICE_SPIKE_SCENARIOS = [
  "instant_fake",
  "simulated_100",
  "simulated_300",
  "simulated_700",
] as const;

export type VoiceSpikeScenario = (typeof VOICE_SPIKE_SCENARIOS)[number];

export const VOICE_SPIKE_DELIVERY_MODES = ["streamed", "buffered"] as const;

export type VoiceSpikeDeliveryMode =
  (typeof VOICE_SPIKE_DELIVERY_MODES)[number];

export const MAX_VOICE_SPIKE_RESPONSE_CHARS = 1_000;
export const MAX_VOICE_SPIKE_RESPONSE_CHUNKS = 12;

type Wait = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export type VoiceBrainTurn = {
  transcript: string;
  deliveryMode: VoiceSpikeDeliveryMode;
  signal?: AbortSignal;
};

export interface VoiceBrain {
  stream(turn: VoiceBrainTurn): AsyncIterable<string>;
}

export class VoiceSpikeInterruptedError extends Error {
  constructor() {
    super("Voice spike turn was interrupted.");
    this.name = "AbortError";
  }
}

export function isVoiceSpikeScenario(value: string): value is VoiceSpikeScenario {
  return (VOICE_SPIKE_SCENARIOS as readonly string[]).includes(value);
}

export function isVoiceSpikeDeliveryMode(
  value: string,
): value is VoiceSpikeDeliveryMode {
  return (VOICE_SPIKE_DELIVERY_MODES as readonly string[]).includes(value);
}

export function scenarioDelayMilliseconds(scenario: VoiceSpikeScenario): number {
  switch (scenario) {
    case "instant_fake":
      return 0;
    case "simulated_100":
      return 100;
    case "simulated_300":
      return 300;
    case "simulated_700":
      return 700;
  }
}

function throwIfInterrupted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new VoiceSpikeInterruptedError();
}

export async function waitForVoiceSpikeDelay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfInterrupted(signal);
  if (milliseconds === 0) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new VoiceSpikeInterruptedError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function validateTurn(turn: VoiceBrainTurn): void {
  if (turn.transcript.length > MAX_VOICE_SPIKE_RESPONSE_CHARS) {
    throw new Error("Voice spike transcript is too long.");
  }
  throwIfInterrupted(turn.signal);
}

function boundedChunks(chunks: Array<string>): Array<string> {
  const accepted = chunks
    .map((chunk) => chunk.slice(0, MAX_VOICE_SPIKE_RESPONSE_CHARS))
    .filter((chunk) => chunk.length > 0)
    .slice(0, MAX_VOICE_SPIKE_RESPONSE_CHUNKS);
  const totalLength = accepted.reduce((total, chunk) => total + chunk.length, 0);
  if (totalLength > MAX_VOICE_SPIKE_RESPONSE_CHARS) {
    throw new Error("Voice spike response exceeds its safety bound.");
  }
  return accepted;
}

function instantResponseChunks(): Array<string> {
  return ["Hej! ", "Hur kan jag hjälpa dig?"];
}

function delayedResponseChunks(
  deliveryMode: VoiceSpikeDeliveryMode,
): { acknowledgement: Array<string>; completion: Array<string> } {
  return deliveryMode === "streamed"
    ? {
        acknowledgement: ["Jag kollar. "],
        completion: ["Det simulerade svaret är klart."],
      }
    : {
        acknowledgement: [],
        completion: ["Jag kollar. Det simulerade svaret är klart."],
      };
}

/**
 * Deterministic, data-free brain used only by the feasibility spike. It never
 * consults Convex, tenant data, tools, or an LLM.
 */
export function createVoiceSpikeBrain(
  scenario: VoiceSpikeScenario,
  wait: Wait = waitForVoiceSpikeDelay,
): VoiceBrain {
  return {
    async *stream(turn) {
      validateTurn(turn);

      if (scenario === "instant_fake") {
        for (const chunk of boundedChunks(instantResponseChunks())) {
          throwIfInterrupted(turn.signal);
          yield chunk;
        }
        return;
      }

      const response = delayedResponseChunks(turn.deliveryMode);
      for (const chunk of boundedChunks(response.acknowledgement)) {
        throwIfInterrupted(turn.signal);
        yield chunk;
      }

      await wait(scenarioDelayMilliseconds(scenario), turn.signal);
      for (const chunk of boundedChunks(response.completion)) {
        throwIfInterrupted(turn.signal);
        yield chunk;
      }
    },
  };
}
