# Architecture

Updated: 2026-09-17, Milestone 9 built from `main` at `b8a492c`. Product direction and source basis: [product-context.md](product-context.md). Mandatory rules: [security-invariants.md](security-invariants.md).

## CURRENT — stack and ownership

Next.js **16.3.5** (App Router), React **19.2.8**, TypeScript, Tailwind CSS **4**, Convex and Clerk. `package.json`/lockfile define dependencies. Local Node is **23.4.0**; moving to **Node 22 LTS** is a planned project maintenance step, not an applied runtime pin. Vercel hosting is planned; production voice hosting remains unvalidated.

Clerk is the source of truth for identity, organizations, memberships and roles. Convex owns application/business data. Local `organizations` maps `clerkOrganizationId` to the internal tenant; local `users` is a minimal identity projection, not a parallel membership/role authority.

`src/components/tenant-bootstrap.tsx` calls `ensureCurrentTenant({})` after authenticated session/active-organization readiness, including user/organization changes. `convex/tenants.ts` provisions from verified identity. `convex/tenant.ts` derives active organization and role from Clerk's verified compact `o` claim and resolves an active local tenant through `requireCurrentTenant()`.

Tenant-scoped reads and mutations use this server context, tenant-first queries and record-ownership checks. Client-side org selection is only a readiness/UI signal. Domain IDs supplied by callers must still be checked against the derived tenant, including linked records.

## CURRENT — implemented domains through Milestone 9

| Area | Implementation and limits |
| --- | --- |
| Customers / Services | `convex/customers.ts`, `services.ts`: tenant-scoped management and active/inactive status. Service prices use `not_specified`, `fixed`, or `from`, with integer minor units and currency. |
| Bookings / Availability | `bookings.ts`, `availability.ts`: create/reschedule/cancel/complete, source snapshots, valid time intervals and confirmed-booking conflict checks. Unix milliseconds; half-open intervals; 1 minute–24 hour duration. Capacity is effectively one across the tenant, not per resource. No business-hours calendar or external booking provider. |
| Knowledge | `knowledge.ts`: active/inactive text entries and tenant-filtered full-text search. No embeddings, vector RAG, file ingestion or provider-owned knowledge store. |
| Conversations / Cases | `conversations.ts`, `cases.ts`: optional customer association, channel label, open/resolved lifecycle, append-only messages and minimal activity events. Cases may stand alone or link to a conversation/customer. `human.escalate` creates/reuses an open follow-up case without resolving the conversation. M9 adds verified acknowledgment and Inbox attention controls, retaining the Case API contract. |
| Service Requests / Inbox | `serviceRequests.ts`, `inbox.ts`: minimal generic work object, indexed attention queue, operator ownership and deterministic summary/context. `workEvents` stores safe action/actor references. |
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
- `human.escalate` creates/reuses an attention item implemented as a follow-up Case; it does not automatically implement takeover/resume or stop all future orchestration. M9 adds operator acknowledgment/resolution and linked request attention, but still does not pause or resume model/channel execution.

## CURRENT — minimal Service Request core and Inbox (M9)

`serviceRequests` has tenant ownership, optional customer/service/initial conversation/booking references, bounded title and structured `wants`/`known`/`missing` summary, timestamps, compact lifecycle, attention state/reason, next action and verified acknowledgment identity. Lifecycle (`new`, `active`, `scheduled`, `completed`, `cancelled`) is independent of attention (`none`, `requested`, `acknowledged`, `resolved`) and next action (`ask_customer`, `book_assessment`, `human_review`, `wait`, `none`). New staff-created requests need assessment. Closing requires resolved attention; reopening goes through active. Scheduling requires a matching confirmed booking. Subsequent booking changes do not automatically move request lifecycle.

The initial conversation is optional and unique per request creation path; it is an initial-context link, not a permanent restriction against a future many-conversation relation. A late customer link is checked and propagated to an initially unknown request customer. Established request customers cannot be replaced through these APIs. Cases can link to a request; linking can adopt a Case conversation as initial context if unclaimed. There is no full conversion engine.

`human.escalate` retains its existing Case result and open-case duplicate resistance. When the conversation has a request, the Case links to it and attention is requested on the same request. Repeated escalation preserves staff acknowledgment and updates the reason. Creating a request from a conversation adopts its existing open escalation. Ordinary `case.create` also links to the initial conversation's request and requests review. No new AI write tools or generic dispatch were introduced. Request creation/editing is staff-operated; AI request creation remains deferred.

`inbox.list` uses tenant-first indexes, excludes linked Cases from the standalone queue, prioritizes requested over acknowledged items and then recency. Queries are bounded: up to 100 requests per attention state (100 total in All) and 100 standalone Cases; UI discloses a limited result set. This is not full pagination. `inbox.detail` returns checked customer/booking links, up to 50 linked Cases, 50 recent messages and 50 recent activity events, and at most 10 booking references. Summaries use explicit saved fields and recorded event labels; they do not infer completed work, missing checks or business facts from transcripts. An empty summary section says no information is recorded.

`workEvents` records reference, action, verified identity identifier and timestamp, without raw content. M9 request and attention writes use this audit path; existing Case APIs retain their prior audit limitations. Acknowledgment does not grant exclusive permissions: another tenant member can resolve attention, but cannot replace a colleague's acknowledgment. Resolving request attention leaves linked Cases, lifecycle and conversation open; a standalone Case uses its existing resolved lifecycle. Reopened linked Cases request attention again. No automatic model pause/resume is implied.

`src/components/inbox.tsx` is the default Swedish staff surface: attention/All filters, request creation, structured summary editing, customer/service/booking links, lifecycle and next-action controls, acknowledgment/resolution and recent conversation history. Tenant/account changes reset local drafts and selected detail. Existing consoles remain in a collapsed administration section. Tailwind conventions are retained; shadcn installation and broader UX work remain deferred.

Structured intake templates, Required Checks, Resources, Estimates/Quotes, multiple appointment/conversation management and a generic workflow engine remain PLANNED.

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
