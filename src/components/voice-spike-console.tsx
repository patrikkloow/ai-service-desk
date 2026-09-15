"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useMemo, useState } from "react";
import {
  collectVoiceSpikeResponse,
  createInstrumentedVoiceResponse,
  createVoiceSpikeBrain,
  summarizeLatencyRecords,
  toSafeLatencyRecord,
  VOICE_SPIKE_DELIVERY_MODES,
  VOICE_SPIKE_SCENARIOS,
  type SafeLatencyRecord,
  type VoiceSpikeDeliveryMode,
  type VoiceSpikeScenario,
} from "@/lib/voice-spike";

function formatMilliseconds(value: number | undefined): string {
  return value === undefined ? "–" : `${Math.round(value)} ms`;
}

function LiveVoiceControls({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [notice, setNotice] = useState("Ready to request microphone access.");
  const [firstAudioAt, setFirstAudioAt] = useState<number | null>(null);
  const conversation = useConversation({
    onAudio: () => setFirstAudioAt((current) => current ?? performance.now()),
    onConnect: () => setNotice("Live voice session connected."),
    onDisconnect: () => {
      setNotice("Live voice session disconnected.");
      onSessionEnded();
    },
    onError: () => setNotice("The live voice session could not be started."),
    onInterruption: () => setNotice("Interruption received."),
  });

  async function startLiveSession() {
    setNotice("Requesting microphone access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setFirstAudioAt(null);
      conversation.startSession();
    } catch {
      setNotice("Microphone access was not granted.");
    }
  }

  function endLiveSession() {
    conversation.endSession();
    onSessionEnded();
  }

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-zinc-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-zinc-100">
      <h2 className="text-base font-semibold">Live browser/microphone check</h2>
      <p className="mt-2 text-zinc-700 dark:text-zinc-300">{notice}</p>
      <p className="mt-1 text-zinc-700 dark:text-zinc-300">
        Connection: {conversation.status}. First audio event: {firstAudioAt === null ? "not observed" : "observed"}.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-md bg-zinc-900 px-3 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          disabled={conversation.status !== "disconnected"}
          onClick={startLiveSession}
          type="button"
        >
          Start microphone session
        </button>
        <button
          className="rounded-md border border-zinc-400 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={conversation.status === "disconnected"}
          onClick={endLiveSession}
          type="button"
        >
          End session
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
        This view intentionally does not display transcripts, session identifiers, tokens, or provider errors.
      </p>
    </section>
  );
}

export function VoiceSpikeConsole() {
  const [scenario, setScenario] = useState<VoiceSpikeScenario>("instant_fake");
  const [deliveryMode, setDeliveryMode] =
    useState<VoiceSpikeDeliveryMode>("streamed");
  const [records, setRecords] = useState<Array<SafeLatencyRecord>>([]);
  const [syntheticStatus, setSyntheticStatus] = useState("No synthetic turn has run.");
  const [isRunningSyntheticTurn, setIsRunningSyntheticTurn] = useState(false);
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(
    "Live testing is not prepared. This does not make a provider request until you choose to prepare it.",
  );

  const summaries = useMemo(() => summarizeLatencyRecords(records), [records]);

  async function runSyntheticTurn() {
    setIsRunningSyntheticTurn(true);
    try {
      const response = createInstrumentedVoiceResponse({
        brain: createVoiceSpikeBrain(scenario),
        scenario,
        deliveryMode,
        // This fixed local marker is never transmitted or persisted.
        transcript: "synthetic voice spike turn",
      });
      const chunks = await collectVoiceSpikeResponse(response);
      const record = toSafeLatencyRecord(`dev-${crypto.randomUUID()}`, response.latency);
      setRecords((current) => [...current, record].slice(-50));
      setSyntheticStatus(`Synthetic turn completed with ${chunks.length} streamed chunk(s).`);
    } catch {
      setSyntheticStatus("Synthetic turn did not complete.");
    } finally {
      setIsRunningSyntheticTurn(false);
    }
  }

  async function prepareLiveSession() {
    setLiveStatus("Preparing a short-lived live session token…");
    try {
      const response = await fetch("/api/voice-spike/token", { cache: "no-store" });
      if (!response.ok) {
        setLiveStatus("Live voice is not configured or is unavailable for this signed-in session.");
        return;
      }
      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("token" in payload) ||
        typeof payload.token !== "string"
      ) {
        setLiveStatus("Live voice returned an invalid session response.");
        return;
      }
      setLiveToken(payload.token);
      setLiveStatus("Live voice is ready. The token is held only in this page session.");
    } catch {
      setLiveStatus("Live voice could not be prepared.");
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <header className="rounded-xl border border-amber-400 bg-amber-100 p-5 text-zinc-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-zinc-100">
        <p className="text-xs font-semibold uppercase tracking-wide">Development-only feasibility spike</p>
        <h1 className="mt-1 text-2xl font-bold">ElevenLabs voice latency experiment</h1>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          This isolated experiment uses a deterministic, data-free brain. It does not access Convex, tenant data, tools, or the production AI orchestrator.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">Synthetic brain timing</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Scenario
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal dark:border-zinc-700 dark:bg-zinc-900"
              onChange={(event) => setScenario(event.target.value as VoiceSpikeScenario)}
              value={scenario}
            >
              {VOICE_SPIKE_SCENARIOS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Delivery
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal dark:border-zinc-700 dark:bg-zinc-900"
              onChange={(event) => setDeliveryMode(event.target.value as VoiceSpikeDeliveryMode)}
              value={deliveryMode}
            >
              {VOICE_SPIKE_DELIVERY_MODES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          disabled={isRunningSyntheticTurn}
          onClick={runSyntheticTurn}
          type="button"
        >
          {isRunningSyntheticTurn ? "Running…" : "Run synthetic turn"}
        </button>
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{syntheticStatus}</p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">Local P50/P95 summary</h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          These local records contain timing and scenario labels only; they never contain audio, transcripts, prompts, or tenant data.
        </p>
        {summaries.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Run a synthetic turn to start a local summary.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Scenario</th>
                  <th className="px-2 py-2 font-medium">Delivery</th>
                  <th className="px-2 py-2 font-medium">First text P50</th>
                  <th className="px-2 py-2 font-medium">First text P95</th>
                  <th className="px-2 py-2 font-medium">Complete P50</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr key={`${summary.scenario}:${summary.deliveryMode}`} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-2 py-2">{summary.scenario}</td>
                    <td className="px-2 py-2">{summary.deliveryMode}</td>
                    <td className="px-2 py-2">{formatMilliseconds(summary.firstTextSentMs?.p50)}</td>
                    <td className="px-2 py-2">{formatMilliseconds(summary.firstTextSentMs?.p95)}</td>
                    <td className="px-2 py-2">{formatMilliseconds(summary.brainCompleteMs?.p50)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {liveToken === null ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold">Live browser/microphone check</h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{liveStatus}</p>
          <button
            className="mt-4 rounded-md border border-zinc-400 px-3 py-2 text-sm font-medium"
            onClick={prepareLiveSession}
            type="button"
          >
            Prepare live session
          </button>
        </section>
      ) : (
        <ConversationProvider connectionType="webrtc" conversationToken={liveToken}>
          <LiveVoiceControls onSessionEnded={() => setLiveToken(null)} />
        </ConversationProvider>
      )}
    </div>
  );
}
