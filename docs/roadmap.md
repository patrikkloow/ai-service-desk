# Risk-first roadmap

Baseline: 2026-09-16, main `a0aeb0a`. Status describes repository implementation, not deployment or production acceptance. Take the largest risks early: **voice latency/quality, AI reliability, booking/integration architecture, and willingness to pay**. This sequence supersedes earlier feature-first plans.

## CURRENT — completed milestones 1–8

| Milestone | Completed scope | Important Git checkpoint(s) |
| --- | --- | --- |
| 1 — Foundation / auth / tenancy | Next.js + Convex, Clerk auth/org context, tenant isolation | `be78b26` — Set up Convex backend; `005113b` — Set up Clerk authentication and tenant isolation |
| 2 — Tenant bootstrap | Secure, repeat-safe provisioning on session/org readiness | `6a49d4e` — Add secure tenant provisioning bootstrap |
| 3 — Customers + Services | General tenant-owned customer/service data and structured pricing | `039d16f` — Add tenant-scoped customers and services core |
| 4 — Bookings + Availability | Internal booking lifecycle and overlap checks | `fe53a16` — Add tenant-scoped bookings and availability |
| 5 — Knowledge | Tenant knowledge entries and active-source search | `7272715` — Add tenant-scoped knowledge base |
| 6 — Conversations + Cases | Messages, lifecycle events and follow-up records | `96bf02a` — Add tenant-scoped conversations and cases |
| 7 — Secure Tool Layer | Explicit read/write registry, validated domain operations, escalation | `d07fbef` — Add secure AI tool action layer |
| 8 — AI Orchestrator v1 | Provider-neutral boundary, bounded context/tool loop, deterministic fake model | `a0aeb0a` — Add secure AI orchestrator |

Milestones 1–2 group the early foundation checkpoints; milestones are not one-to-one with commits. Existing domain/tool/orchestrator tests cover tenant isolation and key behavior. No live LLM, production channels, polished Inbox, Resources, billing or automotive layer is implied by completion.

## IN PROGRESS — 8.5 Voice Feasibility Spike

Separate, **unmerged experimental** branch `spike/voice-feasibility`, inspected tip `8066ffc`. Browser microphone, isolated fake brain, streaming/buffered comparison and interruption harness exist. Swedish STT and the replacement voice show positive manual results; sub-ms to ~1.6 ms first-text timings cover only the fake brain. See [architecture.md](architecture.md) for configuration and evidence limits.

Before considering production reuse: measure speech-end to audible response with trustworthy per-turn timing; separate brain/provider/end-to-end results; compare representative Swedish dates, times, prices and numbers; test interruption, repeated turns and simulated delays. Establish acceptable quality and p50/p95 latency from a real baseline. Live LLM/tool behavior requires separate evaluation. Do not merge the spike automatically or treat its harness as production integration.

## PLANNED — ordered delivery

| Milestone | Outcome |
| --- | --- |
| 9 — Human Handoff + Inbox | Exception/next-action queue centered on Service Requests with attention state/reason, next action and concise AI handoff summaries, plus genuine Cases. Preserve the same work object through handoff, related conversation/booking context, ownership and follow-up. Existing escalation is only a backend primitive; define explicit takeover/resume behavior. |
| 10 — Live LLM + evaluation suite | Server-side live provider adapter alongside deterministic fakes; realistic scenario suite for grounding, tools, injection attempts, failures and escalation, including required hardening/evaluation of final success claims against tool results. Resolve policy prerequisites before enabling autonomous customer-facing writes. |
| 11 — Business Configuration + AI Policies | Per-tenant language/tone, opening hours, booking/handoff rules, enabled tools and enforced autonomy/confirmation policies. |
| 12 — Channel Foundation + Channel Sessions | Common channel contract, verified tenant/customer mapping and provider/session lifecycle distinct from Conversation history. |
| 13 — Webchat | First production customer channel through the shared orchestrator and secure tools. |
| 14 — Booking UX + Resources + provider abstraction | Calendar-like UI, general resources and booking rules; internal/external booking providers behind stable tools. Validate integration assumptions early. |
| 15 — Phone production integration | Production streaming/cancellation, verified voice/session boundary, hosting, telephony and simple channel setup. ElevenLabs voice with our brain; likely Twilio/SIP. |
| 16 — Email | Thread-aware adapter and setup; draft/safe-reply behavior under common policies and handoff. |
| 17 — SMS | Provider-message tracking, setup and shared conversation/tool behavior. |
| 18 — Entitlements + Stripe Billing | Own server-enforced capability model and Stripe direct subscription mapping; keep billing identifiers out of domain logic. |
| 19 — Automotive configuration/layer | Workshop-specific information/workflows above the general core. |
| Pilot | Validate correct handling/bookings, escalation, staff time saved, error rate, customer acceptance and willingness to pay. Start with observe/draft and progress to safe automation. |

As part of or immediately before Milestone 9, introduce the currently absent **Service Request core**: simple lifecycle, structured intake, known/missing information, required checks, attention/next action and assessment appointment relationships. Follow the Price/Estimate/Quote distinctions in [product-context.md](product-context.md); these are planned concepts, not completed features. Keep Cases secondary and avoid duplicate work objects.

Before or as part of Milestone 9, establish the **UX/design-system foundation**: wireframes for onboarding -> overview -> Inbox/conversation -> booking, shared layouts/forms/statuses, and empty/loading/error states. Use shadcn/ui components with a custom product identity, not a generic template. Reuse existing conventions and avoid unnecessary component-framework migration; shadcn is not yet installed on main.

General workflows remain planned; do not turn Milestone 9 into an unlimited workflow-builder project without a scope decision. Pilot discovery and commercial validation should happen throughout, even though the integrated Pilot is listed last. Later milestones may move when evidence justifies it; document changes explicitly.

## Cross-cutting planned work / unresolved decisions

- Move local Node 23.4.0 to the project's planned Node 22 LTS target with compatibility checks.
- Validate production hosting, especially the persistent voice WebSocket path; Vercel is intended, not a proven deployment.
- Add PII-safe latency/outcome/cost observability as integrations arrive.
- Define durable write idempotency and customer identity verification for external channels; current within-turn retry protection is insufficient for network retries across sessions.
- Keep pricing, exact plan bundles, live LLM choice, external booking providers and voice acceptance thresholds open until evaluated.

Each milestone should end with a reviewed diff, relevant checks and a clear Git checkpoint. Keep experiments isolated; never infer permission to merge from a completed milestone.
