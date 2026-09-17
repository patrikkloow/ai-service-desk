# Architecture

Baseline: 2026-09-16, `main` at `a0aeb0a`. Product direction and source basis: [product-context.md](product-context.md). Mandatory rules: [security-invariants.md](security-invariants.md).

## CURRENT — stack and ownership

Next.js **16.3.5** (App Router), React **19.2.8**, TypeScript, Tailwind CSS **4**, Convex and Clerk. `package.json`/lockfile define dependencies. Local Node is **23.4.0**; moving to **Node 22 LTS** is a planned project maintenance step, not an applied runtime pin. Vercel hosting is planned; production voice hosting remains unvalidated.

Clerk is the source of truth for identity, organizations, memberships and roles. Convex owns application/business data. Local `organizations` maps `clerkOrganizationId` to the internal tenant; local `users` is a minimal identity projection, not a parallel membership/role authority.

`src/components/tenant-bootstrap.tsx` calls `ensureCurrentTenant({})` after authenticated session/active-organization readiness, including user/organization changes. `convex/tenants.ts` provisions from verified identity. `convex/tenant.ts` derives active organization and role from Clerk's verified compact `o` claim and resolves an active local tenant through `requireCurrentTenant()`.

Tenant-scoped reads and mutations use this server context, tenant-first queries and record-ownership checks. Client-side org selection is only a readiness/UI signal. Domain IDs supplied by callers must still be checked against the derived tenant, including linked records.

## CURRENT — implemented domains through Milestone 8

| Area | Implementation and limits |
| --- | --- |
| Customers / Services | `convex/customers.ts`, `services.ts`: tenant-scoped management and active/inactive status. Service prices use `not_specified`, `fixed`, or `from`, with integer minor units and currency. |
| Bookings / Availability | `bookings.ts`, `availability.ts`: create/reschedule/cancel/complete, source snapshots, valid time intervals and confirmed-booking conflict checks. Unix milliseconds; half-open intervals; 1 minute–24 hour duration. Capacity is effectively one across the tenant, not per resource. No business-hours calendar or external booking provider. |
| Knowledge | `knowledge.ts`: active/inactive text entries and tenant-filtered full-text search. No embeddings, vector RAG, file ingestion or provider-owned knowledge store. |
| Conversations / Cases | `conversations.ts`, `cases.ts`: optional customer association, channel label, open/resolved lifecycle, append-only messages and minimal activity events. Cases may stand alone or link to a conversation/customer. `human.escalate` creates/reuses an open follow-up case without resolving the conversation. No full assignment/handoff workflow yet. |
| Tool Layer | `toolRegistry.ts`, `tools.ts`: explicit registry, separate read query/write mutation paths, strict input validators and named domain operations. |
| AI Orchestrator v1 | `orchestrator.ts`, `orchestratorCore.ts`, `orchestratorInternal.ts`, `modelAdapter.ts`: authenticated text turns, bounded context/tool loop and server-written AI responses. |

UI in `src/components/*-console.tsx` is minimal authenticated runtime tooling. A channel enum (`web`, `sms`, `phone`, `email`, `other`) does not mean those external channels are connected. Current functions run in a signed-in Clerk organization context; public/customer channel authentication is future work.

## CURRENT — AI execution boundary

`processCustomerMessage` accepts only `conversationId` and `message`. It appends the customer message, loads authorized conversation context, invokes the model adapter/tool loop and saves the AI response through an internal mutation.

- Read tools: `knowledge.search`, `customer.find`, `service.list`, `availability.check`.
- Write tools: `booking.create`, `booking.reschedule`, `booking.cancel`, `case.create`, `human.escalate`.
- Model adapters return data, never execute database calls. The server strictly parses model tool arguments and attaches the current conversation context; model-supplied authority/context overrides are rejected.
- Context: at most 12 messages, each capped at 4,000 characters. Incoming customer text and final AI text are also capped at 4,000. Tool loop permits at most five tool attempts, with a final model response opportunity.
- The public action uses `DevelopmentFakeModelAdapter`, which returns a clearly labeled fixed development response. `ScriptedFakeModelAdapter` exercises tool behavior in deterministic tests. **No live LLM is configured.**
- The same uncertain write request is blocked from retry within a turn. This is not durable or cross-turn idempotency. Ordinary booking/case creation has no general idempotency key; escalation has open-case duplicate resistance.
- Tool-linked conversation activity stores event type and safe entity references, not raw arguments or contact data. This is not a complete audit system for every domain write.

Role claims are validated (`org:admin` / `org:member`), but current domains do not implement a fine-grained role permission matrix. Configurable AI confirmation policies and entitlements are also absent. Prompt instructions are guidance, never authorization.

## CURRENT — limitations

- Final model text is format/length validated, but not generically semantically verified against tool results. Success-claim verification is a required hardening/evaluation target, especially for Milestone 10 live LLM/evals.
- Tenant/conversation routing does not prove an external customer is authorized to mutate every booking in the tenant. External channels must enforce customer authorization to the specific target record/action.
- `human.escalate` creates/reuses an attention item implemented as a follow-up Case; it does not automatically implement takeover/resume or stop all future orchestration. Human handoff behavior remains Milestone 9 work.

## PLANNED — Service Request core and Inbox

Service Request is the primary work object from intake through assessment/estimate, booking, quote and completion; it is absent from the current schema, tools and UI. Conversations, Cases and Bookings remain CURRENT. See [product-context.md](product-context.md) for terminology and pricing semantics.

Introduce a simple Service Request core as part of or immediately before Milestone 9: template-specific structured intake, known/missing information, required checks, attention state/reason, next action and related assessment/work appointments. Assessments may be free or paid site visits, consultations, diagnostics, measurements or inspections. Price is a structured fact; Estimate is preliminary; Quote is a formal offer. Estimate/Quote handling and these relationships are planned, not existing schema or finalized APIs. Industry-specific fields belong in future templates/layers, not core columns.

The Inbox should prioritize Service Requests needing attention/next action, with a concise handoff summary of intent, collected information/actions, missing information/checks, allowed pricing/estimate, attention reason and recommended next step. Keep resolved AI-handled conversations accessible outside the main work queue. Human handoff should preserve the same Service Request; Cases remain secondary exceptions/internal follow-up. Continuing a Case into a Service Request must preserve context without duplicate administration; no conversion feature exists today. Avoid a general workflow engine for the MVP.

## PLANNED — channel and provider boundaries

```text
Phone / Email / SMS / Webchat adapters (Channel Layer)
  -> Conversations + Channel Sessions
  -> shared AI Orchestrator -> Secure Tool Layer -> business domains/providers
```

A Conversation is long-lived business history; a Channel Session represents a call/chat session or channel-specific interaction. Provider IDs, email threading and interruption state belong at the channel/session boundary. Do not equate a call with the whole conversation or merge customer identities using weak evidence.

ElevenLabs Speech Engine handles STT, TTS, turn-taking and interruptions. Our server owns model selection, orchestration, tenant authorization and tools. Twilio/SIP is the likely later telephony path, not implemented. Voice requires a streaming/cancellable server adapter; the current orchestrator is request/response. A proposed minimal interface is `AsyncIterable<string>` with cancellation, retaining all existing security checks. Validate production WebSocket hosting before selecting its deployment architecture; do not assume planned Vercel hosting proves this path.

BookingProvider will sit behind the existing tool concepts so internal and external booking systems share authorization and policy rules. General Resources and business hours, buffers, blocked time, holidays and notice rules remain planned. Tenant business/AI configuration and workflow execution remain future components.

Observability should expose safe metadata: channel, stage latency, tool names/outcomes, escalation, provider/model and approximate cost. Separate model/brain, tool, speech-provider and end-to-end timings. Existing activity events and spike timing records are foundations, not a production telemetry/cost system.

## UNMERGED EXPERIMENT — voice feasibility

`spike/voice-feasibility` is separate from main; inspected tip **`8066ffc`**. It contains `e3f1585` (initial spike), `58d5fb5` (CJS async fix), `4c7759c` (environment/startup fix), and `8066ffc` (transient transcript/debugging and delivery comparison). None is merged into this documentation's baseline. Its `docs/voice-feasibility-spike.md` exists only on that branch.

The spike tests browser microphone -> ElevenLabs -> verified upstream WebSocket -> isolated fake brain -> streamed text -> TTS/audio. It does not call Convex, tools or a live LLM. Dev routes require sign-in and explicit development gating; upstream JWT verification stays enabled. Synthetic delay scenarios are 0/100/300/700 ms; live settings and synthetic UI selectors are distinct.

Project live-test evidence reports Swedish STT appears good and first text in instant-fake mode at roughly **0.3–1.6 ms**. These are custom-brain timings after transcript receipt, not LLM inference, STT/TTS latency or speech-end-to-audible-response measurements. Reliable per-turn first-audio/end-to-end measurement is still missing; the audio callback alone cannot establish audible onset.

Voice **`cLAH1kXlkAivJHxCW601`** was reported materially better than the previous voice. Engine **`seng_0901m2kn33mefy6r33rpww3dq0be`** uses **`eleven_flash_v2_5`**, Swedish. The completed “Tune ElevenLabs voice settings” task (`01a0abe6-e403-7131-824e-2d3aad4b4ff5`) reports a verified in-place update to **speed 0.94 / stability 0.65**, preserving other settings. This is a reported remote experiment state, not tracked production configuration or a fresh provider check by this documentation task. Tempo/prosody tuning and representative listening tests remain experimental.

The spike's older statement that no live measurements exist is superseded only by the narrow project observations above. Voice feasibility is promising but still in progress; no production latency/quality acceptance has been established.
