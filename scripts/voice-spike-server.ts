import { loadEnvConfig } from "@next/env";
import { SpeechEngine } from "@elevenlabs/elevenlabs-js";
import {
  createInstrumentedVoiceResponse,
  createVoiceSpikeBrain,
  isVoiceSpikeDeliveryMode,
  isVoiceSpikeScenario,
  requireVoiceSpikeEnabled,
  toSafeLatencyRecord,
  VoiceSpikeInterruptedError,
  type VoiceSpikeDeliveryMode,
  type VoiceSpikeScenario,
} from "../src/lib/voice-spike";

loadEnvConfig(process.cwd());
requireVoiceSpikeEnabled();

function configuredScenario(): VoiceSpikeScenario {
  const value = process.env.VOICE_SPIKE_SCENARIO ?? "instant_fake";
  if (!isVoiceSpikeScenario(value)) {
    throw new Error("VOICE_SPIKE_SCENARIO is invalid.");
  }
  return value;
}

function configuredDeliveryMode(): VoiceSpikeDeliveryMode {
  const value = process.env.VOICE_SPIKE_DELIVERY_MODE ?? "streamed";
  if (!isVoiceSpikeDeliveryMode(value)) {
    throw new Error("VOICE_SPIKE_DELIVERY_MODE is invalid.");
  }
  return value;
}

function configuredPort(): number {
  const value = Number(process.env.VOICE_SPIKE_PORT ?? "3001");
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error("VOICE_SPIKE_PORT is invalid.");
  }
  return value;
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required for live voice testing.");

const scenario = configuredScenario();
const deliveryMode = configuredDeliveryMode();
const brain = createVoiceSpikeBrain(scenario);
const safeSessionIds = new WeakMap<object, string>();

function safeSessionId(session: object): string {
  const existing = safeSessionIds.get(session);
  if (existing !== undefined) return existing;
  const identifier = `voice-spike-${crypto.randomUUID()}`;
  safeSessionIds.set(session, identifier);
  return identifier;
}

const server = new SpeechEngine.Server({
  port: configuredPort(),
  apiKey,
  // Authentication is deliberately left enabled. The official SDK verifies
  // ElevenLabs' signed upstream request before accepting the connection.
  debug: false,
  async onTranscript(transcript, signal, session) {
    const latestUserText = [...transcript]
      .reverse()
      .find((message) => message.role === "user")?.content;
    if (latestUserText === undefined) return;

    const response = createInstrumentedVoiceResponse({
      brain,
      scenario,
      deliveryMode,
      transcript: latestUserText,
      signal,
    });

    try {
      // The official SDK assigns the active Speech Engine event ID and stops
      // outdated chunks when its AbortSignal fires after an interruption.
      await session.sendResponse(response.stream);
    } catch (error) {
      if (signal.aborted || error instanceof VoiceSpikeInterruptedError) return;
      // Do not log raw transcript, protocol headers, or provider errors.
      console.error("Voice spike turn could not be completed.");
      return;
    }

    if (!signal.aborted) {
      console.info(
        JSON.stringify(toSafeLatencyRecord(safeSessionId(session), response.latency)),
      );
    }
  },
  onError() {
    // Avoid provider payloads, headers, and transcript content in logs.
    console.error("Voice spike Speech Engine connection error.");
  },
});

server.start();
console.info(
  `Voice feasibility spike server listening on port ${configuredPort()} (${scenario}, ${deliveryMode}).`,
);
