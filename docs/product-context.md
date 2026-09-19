# AI Service Desk — product context

Updated: 2026-09-19 for Booking System v1, built from `main` at `3648568`. “CURRENT” describes this feature branch, not production readiness. “PLANNED” is a product decision or future direction, not an existing feature.

## Product and market

AI Service Desk is the product. Phone, email, SMS and webchat are optional channels/modules sharing the same customers, conversations, knowledge, bookings and business logic. A business should be able to adopt only the capabilities it needs.

Start with Swedish SMBs; automotive workshops are the first market wedge and pilot opportunity. Keep the core general-purpose and industry-neutral. Vehicles, registration numbers, workshop orders and other industry-specific concepts belong in later configuration/layers, not mandatory core fields.

The product should reduce missed customer contacts and staff workload while making correct bookings and reliably handing uncertain work to people. Validate willingness to pay and time saved with real businesses; plan names, prices and usage allowances are not settled.

## Shared domain vocabulary

| Concept                     | Responsibility and status                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organizations               | CURRENT: tenant boundary, linked to a Clerk organization.                                                                                                                                                                                                                                   |
| Users / Roles               | CURRENT: Clerk identity, membership and roles; minimal local user projection. Roles accepted today: `org:admin`, `org:member`.                                                                                                                                                              |
| Customers                   | CURRENT: tenant-owned people or business customers, optional contact details.                                                                                                                                                                                                               |
| Services                    | CURRENT: structured offerings, optional duration, explicit pricing.                                                                                                                                                                                                                         |
| Conversation                | CURRENT: channel-agnostic interaction history, with messages and activity events.                                                                                                                                                                                                           |
| Service Request             | CURRENT: minimal primary work object with structured wants/known/missing summary, lifecycle, attention and next action, plus optional customer/service/conversation/booking links. Full intake-to-quote workflow remains PLANNED.                                                           |
| Case                        | CURRENT backend; secondary product role: exception/support/attention object for matters outside the Service Request flow or internal follow-up.                                                                                                                                             |
| Inbox                       | CURRENT: Swedish attention queue and detail view centered on Service Requests, plus unlinked Cases; acknowledgment, attention resolution and deterministic handoff context.                                                                                                                 |
| Knowledge                   | CURRENT: tenant-owned FAQ/policy text and search; structured Services remain the pricing source.                                                                                                                                                                                            |
| Bookings                    | CURRENT: internal resource-aware bookings, day/week desktop calendar, mobile agenda, resource schedules and blocked time. External providers and public customer booking are PLANNED.                                                                                                       |
| Workflows                   | PLANNED: general event/trigger/action behavior; no workflow engine exists.                                                                                                                                                                                                                  |
| Business / AI Configuration | CURRENT: tenant business identity/contact details, timezone/default language, ordinary weekly hours, bounded response language/tone, and server-enforced action policies for booking/case writes. Advanced booking rules, enabled-tool policy and free-text AI instructions remain PLANNED. |
| Integrations                | PLANNED: business-system and channel adapters; no production channel integration exists on main.                                                                                                                                                                                            |

## Service Request principle — minimal core CURRENT; full flow PLANNED

Minimize administration: keep the same Service Request from the first customer need through completion. Do not require a job to bounce Conversation -> Case -> Service Request -> Booking. Conversations retain interaction history; bookings represent appointments associated with the work.

Planned end-to-end flow: customer contact -> AI creates/links Service Request -> structured intake and known/missing information -> safe known price or preliminary estimate when allowed -> required checks/assessment -> assessment booking if appropriate -> business inspects and updates the Service Request -> quote if needed -> customer accepts -> work is scheduled -> completed. An assessment appointment can be a site visit, consultation, diagnostic, measurement or inspection, free or paid depending on the service.

The planned core holds service/template-specific intake answers, known vs missing information, required checks/inspection requirements, attention state/reason and next action. Illustrative actions include `ASK_CUSTOMER`, `BOOK_ASSESSMENT`, `HUMAN_REVIEW`, `SEND_ESTIMATE`, `CREATE_QUOTE` and `WAIT`; these are not finalized API enums. Keep the MVP lifecycle simple, not a giant workflow engine. Future industry templates supply fields such as vehicle details, room size or electrical panel information without industry-specific columns in the general core.

Human attention does not require a separate Case: preserve the same Service Request wherever possible. Cases remain secondary for complaints, invoice disputes, requests to speak to an owner/staff, unrelated support or true exceptions; the existing Case backend remains valid. If a Case becomes a service job, link/convert/continue into a Service Request while preserving context, rather than closing context and duplicating administration. M9 supports explicit Case links and carries an existing open escalation into a request created from its conversation. This is not a full conversion engine.

Pricing terms are distinct:

- **Price:** known structured service price/fact; structured Services exist today.
- **Estimate:** preliminary amount/range based on current information and stated assumptions, clearly non-final.
- **Quote:** formal offer/business document, potentially requiring human approval. AI must not silently turn an estimate into a binding quote.

Estimate/Quote handling, structured intake templates and Required Checks remain PLANNED. M9 implements only the generic request/attention foundation; staff create and update requests, while the existing escalation tool updates attention through its conversation link.

## Product UX direction — M9 foundation CURRENT; broader UX PLANNED

- Make daily operation simple for nontechnical owners and staff. Use progressive complexity: useful defaults first, advanced configuration only when needed. Mobile-first, with a single-pane request detail on phones and an efficient list/detail layout on desktop.
- Use one Inbox across channels as an exception/next-action work surface, not merely a chronological message list. Inbox shows only Service Requests needing attention plus genuine standalone Cases/exceptions; Förfrågningar shows all Service Requests throughout their lifecycle. The authenticated product shell also provides a minimal real-data Overview, Kalender, Kunder and Inställningar. Settings now includes Business profile, ordinary opening hours and AI policy pages alongside Services and Knowledge. Service Requests are called “förfrågningar”; standalone Cases are secondary “uppföljningar”. Development consoles are separate under `/dev`, server-gated to authenticated development mode and absent from operator navigation.
- Give staff a concise AI handoff summary: what the customer wants, what AI collected/did, missing information/checks, preliminary price/estimate when allowed, why human attention is needed and the recommended next action. Preserve the same Service Request through handoff where possible.
- Booking uses day/week views on desktop, a daily agenda on mobile, understandable appointments and a normal resource filter. Separate resource columns remain a later UX option because FullCalendar Scheduler resource views are Premium. Do not expose database IDs or raw timestamps as the workflow.
- Explain AI activity in everyday language: “Checked availability” and “Created booking,” with traceable outcomes. Do not show raw tool arguments or prompts.
- Guide onboarding through business details, services/prices, opening hours, knowledge, booking connection, selected channels, AI permissions, testing and activation. Industry selection must not make the core industry-specific.
- Give each channel a clear setup/status/test flow, including when AI should answer and how staff can take over. Adapt navigation to capabilities and user permissions; backend checks remain mandatory.
- Establish shadcn/ui as the component foundation with our own typography, spacing, density, status language and product identity. Follow existing project conventions; avoid unnecessary component-framework migrations. CURRENT on this branch: a minimal shadcn/ui Radix foundation with Tailwind 4, restrained shared styling, Sidebar, Tabs, Collapsible, Empty, Tooltip and Scroll Area.

## Commercial and AI boundaries — CURRENT and PLANNED

Clerk owns authentication, organizations, memberships and roles. Stripe direct is the billing/subscription direction; Clerk Billing is not the chosen billing architecture. Our own entitlement/capability layer translates plans into product features. Keep Stripe product/price IDs inside the billing integration, not scattered through business logic. Billing and entitlements are not implemented.

Permissions answer **who may perform an action**; capabilities/entitlements answer **what the organization has access to**. Enabling a paid feature must never confer a user's permission, and an admin role must not implicitly unlock paid features.

ElevenLabs is voice infrastructure, not the AI business-logic brain. Our orchestrator and Secure Tool Layer remain the single business-logic path across channels.

Booking now has a general tenant-scoped Resources model for people, rooms and equipment. A resource is separate from a Clerk user. The internal booking engine and AI tools use the same resource-aware rules. A booking-provider abstraction and external booking systems remain planned; they should preserve the stable tool and policy boundaries. Do not introduce industry-specific resource tables as the general model.

AI autonomy distinguishes allowed actions, actions requiring verified customer confirmation and actions requiring a human. M11 stores a small per-tenant policy matrix and enforces it in the server orchestrator before Tool Layer writes. Human-required actions use the existing duplicate-resistant escalation path. Confirmation-required actions remain blocked because a trusted external customer-session confirmation signal does not exist until later channel work; model text, client flags and conversation content cannot satisfy this requirement. `human.escalate` remains always available. Pilot direction is observe/draft mode, then safe automation before wider autonomy.

## How coding agents should use these docs

Before substantial work, read all four: [product context](product-context.md), [architecture](architecture.md), [roadmap](roadmap.md), and [security invariants](security-invariants.md). Then inspect current code, relevant tests and Git status/history; docs do not replace implementation checks. Preserve invariants, keep planned features distinct from implemented ones, and update these docs when architecture, roadmap or product decisions materially change. Follow the existing root `AGENTS.md` for framework guidance.

Use isolated branches for experiments. The voice spike is not a dependency of main; do not bring it into a feature/docs branch accidentally.

## Source basis

Reconciled against the AI Service Desk Project conversation **Välj rätt kontostrategi** (`6aa7a4b2-d9a8-83ed-bfac-771af2792903`, full paginated history), its attached tutorial/reference material, and this repository's code/history. Later explicit project decisions supersede earlier proposals: risk-first roadmap, Stripe direct, a shared custom AI brain, and the post-review decision that Service Request is the primary work object with Cases secondary. The synced Project `sources/` directory was empty at review.

This repository began independently with Create Next App (`bd12e3b`). The earlier AI Receptionist tutorial/demo is reference material only; the project decision is independent implementation, not copying that demo's code, UI, prompts or configuration into this product.

## M9 operator semantics and limits

“Jag tar hand om detta” records the verified staff identity; it is not an exclusive permission grant or a live AI pause. Any current tenant member can resolve attention, while acknowledgment cannot silently replace a colleague. Resolving request attention leaves the conversation, request lifecycle and linked Cases unchanged. A standalone Case is resolved by its Inbox action. Repeated escalation can request attention again and preserves an existing acknowledgment.

New requests begin with attention requested for staff assessment. Lifecycle is `new`, `active`, `scheduled`, `completed`, `cancelled`; attention and next action are separate. Scheduling requires a matching confirmed booking; closing requires resolved attention, and reopening a terminal request goes through `active`. Booking lifecycle changes are not automatically synchronized to request lifecycle.

The UX shell pass adds minimal request creation using existing server defaults, action-first details and collapsed manual editing. Customer, service, knowledge and booking management have dedicated routes; Booking System v1 replaces the earlier booking list with the internal calendar while retaining the same shell. Overview counts explicitly disclose bounded query results. This remains an authenticated staff MVP, not a production channel launch.

## CURRENT — M10 live AI and reliability

One server-side OpenAI adapter is available behind the provider-neutral model interface. Deterministic fake mode remains the default for development/tests. Live mode requires explicit server configuration; no normal operator model controls or production customer channel were added. `/dev` shows the configured mode/model and safe run outcomes; use synthetic data in a test organization because live tools can write real tenant records.

Action confirmations are composed by the server from successful Tool Layer results. A write attempt is terminal within the turn, including failed/uncertain outcomes: no further model call or automatic retry follows it. Unbacked model prose is not published, even without a tool call. This intentionally conservative M10 release uses evidence-backed response templates and short Swedish follow-up questions; knowledge is displayed as an attributed excerpt, not a completed-action confirmation or authoritative service price. Structured Services remain the pricing authority.

`npm run eval:ai` runs offline reliability scenarios across knowledge, prices, availability, writes, handoff, malicious calls, isolation, provider failures and Swedish responses. `npm run eval:ai:live` is an optional synthetic, read-only OpenAI smoke; paid/network calls are not a CI requirement. Offline scripts validate orchestration and server enforcement, not a real model's ability to understand every customer request. Knowledge relevance, selecting the right service/time/record, and overall conversational quality still require live evaluation and staff acceptance.

M10 is complete for this scoped implementation; real-provider smoke is unverified because no local provider key was available. External-customer target-record authorization, general cross-channel idempotency and real channel takeover remain future work. Booking System v1 later adds scoped staff-create idempotency only. This is not approval to enable autonomous customer-facing writes.

## CURRENT — M11 business configuration and AI policies

Each tenant receives separate Business Profile, Business Hours and AI Policy records during repeat-safe tenant bootstrap. Members can read settings; only verified `org:admin` users can change them. Business identity includes company name, timezone, default language and optional contact/address/description fields. Weekly hours support closed days and multiple non-overlapping intervals. They describe ordinary opening hours only: resource schedules, availability, booking conflicts and capacity are separate; holiday and buffer rules remain planned.

The AI can answer business-profile and opening-hours questions through explicit read tools. The provider sees only the fixed tool definitions. After selecting one, the server renders the authorized tenant configuration and ends the turn; tenant-authored profile text is never replayed to the provider or inserted into system instructions. Response language (`business default`, Swedish or English) and tone (`neutral`, `warm` or `formal`) are bounded enums translated into fixed server wording. There is no free-text tenant instruction field.

The action-policy matrix covers booking create/reschedule/cancel and ordinary case creation with `allow`, `confirm` or `human` choices. Safe bootstrap defaults require confirmation for create/reschedule, human handling for cancellation and allow ordinary case creation. Missing, malformed or unknown policy data fails to human handling. Policy stops produce deterministic customer text and PII-safe outcome categories; only allowed actions reach their existing Tool Layer operations. Configuration audit events record domain, action, verified actor and timestamp without copied field values.

M11 is complete for this scoped authenticated configuration foundation. It does not add an external customer identity/consent boundary, automatic holiday enforcement, booking buffers, channel sessions, free-text AI instructions, production deployment, or full onboarding. M12 must establish trusted channel/session identity before confirmation-required customer writes can be enabled.

## CURRENT — Booking System v1

The authenticated operator calendar uses FullCalendar React 7.1 Standard under its MIT license. Desktop has day/week views; mobile has a daily agenda without horizontal overflow at the verified 390 px viewport. Staff create bookings from existing or new customers, select a service and one resource, optionally link an existing Service Request, then view, reschedule, complete or cancel the booking. All actions work without drag-and-drop. The calendar component displays data and opens our shadcn dialogs; Convex owns authorization and booking rules.

Resources are tenant-scoped people, rooms or equipment with capacity one, active/inactive status, service restrictions, their own weekly schedules and explicit blocked intervals. Resource configuration is admin-only; verified members can book. Business opening hours stay separate. Administrators may explicitly copy current business hours into a resource schedule once; no ongoing synchronization is implied. New bookings require a valid scheduled resource. When AI omits a resource, the server chooses the first eligible available resource deterministically by Swedish name order and ID.

Confirmed legacy bookings without a resource remain visible and temporarily block the same interval across all resources. Staff can explicitly assign one after the normal checks pass. No migration or automatic historical assignment runs. Calendar range reads include bookings that start before the visible range and return all matches within a bounded 45-day request rather than truncating at 100.

Staff and AI now reach the same resource-aware create/reschedule domain operations. M11 policy still applies only to AI orchestration: `allow` may reach the Tool Layer, while `confirm` and `human` retain their existing server behavior. Staff authority cannot be selected by model arguments. Calendar creation has a tenant-scoped durable idempotency key, so an exact retry returns the original booking and a changed request under the same key is rejected. Convex mutation transactions provide atomic read/check/write behavior; deterministic tests simulate conflicts, but real parallel-load behavior has not been separately stress-tested.

This release does not add public booking, external provider synchronization, resource groups/capacity above one, multiple required resources, holidays, recurring exceptions, buffers, travel planning or automatic Service Request lifecycle transitions. A linked booking adds the reference only; completing the appointment does not complete the Service Request.
