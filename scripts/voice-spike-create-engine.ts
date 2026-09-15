import { loadEnvConfig } from "@next/env";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { requireVoiceSpikeEnabled } from "../src/lib/voice-spike";

loadEnvConfig(process.cwd());
requireVoiceSpikeEnabled();

const apiKey = process.env.ELEVENLABS_API_KEY;
const wsUrl = process.env.VOICE_SPIKE_WS_URL;
const voiceId = process.env.VOICE_SPIKE_VOICE_ID;

if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required.");
if (!wsUrl || new URL(wsUrl).protocol !== "wss:") {
  throw new Error("VOICE_SPIKE_WS_URL must be a public wss URL.");
}
if (!voiceId || voiceId.length > 128) {
  throw new Error("VOICE_SPIKE_VOICE_ID is required.");
}

const client = new ElevenLabsClient({ apiKey });
const engine = await client.speechEngine.create({
  name: "AI Service Desk voice feasibility spike",
  speechEngine: { wsUrl },
  asr: { quality: "high", provider: "elevenlabs", userInputAudioFormat: "pcm_16000" },
  tts: {
    // Chosen Swedish realtime baseline for this feasibility experiment.
    modelId: "eleven_flash_v2_5",
    voiceId,
    agentOutputAudioFormat: "pcm_16000",
    stability: 0.5,
    speed: 1,
  },
  turn: {
    turnTimeout: 7,
    turnEagerness: "normal",
  },
  conversation: {
    clientEvents: ["audio", "interruption", "agent_response", "user_transcript"],
  },
  privacy: {
    recordVoice: false,
    deleteTranscriptAndPii: true,
    deleteAudio: true,
  },
  language: "sv",
  tags: ["development", "voice-feasibility-spike"],
});

// This ID is not a secret. Never print the API key, WebSocket URL, or voice ID.
console.info(`Created Speech Engine: ${engine.engineId}`);
