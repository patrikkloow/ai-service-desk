# ElevenLabs voice feasibility spike

This is an isolated, development-only experiment. It does not alter Convex,
Clerk, tenant authorization, application data, tools, or the production AI
orchestrator.

## What it exercises

The path under test is:

```text
browser microphone -> ElevenLabs Speech Engine -> verified upstream WebSocket
-> isolated fake voice brain -> streamed text -> ElevenLabs TTS -> browser audio
```

The server uses the official `@elevenlabs/elevenlabs-js` Speech Engine server
with its default upstream JWT verification enabled. It deliberately does not
set `disableAuth`. The browser uses `@elevenlabs/react` and receives only a
short-lived session token from the authenticated, development-only route.

The fake brain never reads Convex, calls tools, contacts an LLM, or receives a
tenant/user/role value from the browser. It has four deterministic scenarios:

- `instant_fake`
- `simulated_100`
- `simulated_300`
- `simulated_700`

For every delayed scenario, `streamed` sends a short acknowledgement before the
configured delay; `buffered` sends one response after it. This makes the
time-to-first-text difference observable without claiming a provider latency.

## Local setup for a live run

Keep values in `.env.local`; it is ignored by Git. Do not expose the API key in
the browser and do not use a `NEXT_PUBLIC_` name for it.

```bash
VOICE_SPIKE_ENABLED=true
ELEVENLABS_API_KEY=server-only-value
VOICE_SPIKE_WS_URL=wss://public-tunnel.example/ws
VOICE_SPIKE_VOICE_ID=your-selected-voice-id
ELEVENLABS_SPEECH_ENGINE_ID=created-engine-id
```

1. Start a public HTTPS/WSS tunnel that forwards to local port `3001`. Its WSS
   URL must be known before creating the Speech Engine.
2. With `VOICE_SPIKE_WS_URL` and `VOICE_SPIKE_VOICE_ID` set, run
   `npm run voice:spike:create-engine`. It creates one development Speech Engine
   and prints only its non-secret engine ID. Copy that value to
   `ELEVENLABS_SPEECH_ENGINE_ID` locally.
3. Run `npm run voice:spike:server`, then `npm run dev`.
4. Sign in, open `/voice-spike`, select a scenario and delivery mode, choose
   **Prepare live session**, then **Start microphone session**.

The creation script is intentionally manual because it creates an external
provider resource. The server is intentionally separate from Next.js because
Speech Engine needs a public WebSocket endpoint. Never make that endpoint public
without the SDK's default request verification.

## Live test matrix

Run several repetitions of every scenario in both delivery modes. Record only
the safe timing fields emitted by the spike: first text, final text, brain
completion, optional first audio, scenario, and delivery mode. No transcript,
audio, prompt, token, HTTP header, Clerk identifier, or tenant identifier is
recorded.

Use these Swedish utterances during manual evaluation:

1. `Hej, när stänger ni idag?`
2. `Jag vill boka en tid nästa vecka.`
3. `Kan du hjälpa mig med en fråga om en tjänst?`
4. `Vänta, jag vill ändra min fråga.`
5. `Tack, det var allt.`

Test interruption by starting the next utterance while a delayed response is
speaking. Speech Engine passes an `AbortSignal` to the server handler and its
event protocol drops stale response chunks. The deterministic unit tests cover
the corresponding stale-turn/cancellation rule.

## Latency interpretation

The local console computes per-scenario/per-delivery P50 and P95 using a
nearest-rank percentile from up to 50 in-memory safe records. The server logs
the same safe shape for a live turn. These metrics are not persisted and are not
cross-tenant observability.

The deterministic suite proves the expected shape only: a streamed simulated
300 ms turn emits its acknowledgement at zero fake-clock milliseconds, while a
buffered one first emits at 300 ms. It does not measure network, Swedish STT,
TTS, microphone, or real provider latency. Live measurements must be reported
separately after the setup above is available.

For a real run, publish the measurements in three separate columns rather than
combining them into one number:

- **Custom-brain time:** Speech Engine transcript received by our server to
  first/final text chunk. In this spike that is fake-brain delay, not model
  inference.
- **ElevenLabs/provider time:** the interval after our first text chunk until
  the browser's first audio callback, where provider diagnostics permit it.
- **End-to-end time:** the browser-observed interval from the user-turn event
  to first audible audio. This includes STT, network, our brain, TTS, and
  playback and must never be described as model inference alone.

There are no live provider measurements in the repository checkpoint. The only
measured deterministic facts are fake-clock behavior: instant first text at
0 ms; streamed simulated turns acknowledge at 0 ms; buffered simulated 100,
300, and 700 ms turns first emit after their configured delay. These values do
not measure Flash v2.5, Swedish STT/TTS, network, or end-to-end latency.

## Current orchestrator compatibility

Milestone 8's orchestrator is request/response oriented, so it is intentionally
not connected to this spike. The minimum follow-up, if live results justify it,
is a new server-only streaming turn adapter that turns generated output into an
`AsyncIterable<string>` and observes cancellation. It must retain existing
Clerk/Convex tenant derivation and route all business actions through the secure
tool layer. That is a future design decision, not part of this spike.

## Chosen experiment configuration

The manual engine-creation script uses Speech Engine with Swedish (`sv`),
`eleven_flash_v2_5`, PCM 16 kHz input/output, normal turn eagerness, and a seven
second turn timeout. Flash v2.5 is the sole Swedish realtime baseline: optimize
for low latency, streaming time-to-first-audio, interruption/barge-in, and
natural pronunciation of dates, times, prices, and phone numbers. The fake
brain itself is the only configured source of an acknowledgement. Test a
slower/higher-quality model only if manual Swedish testing shows a clear
Flash-v2.5 quality issue; record it as a separate comparison condition rather
than changing this baseline.
