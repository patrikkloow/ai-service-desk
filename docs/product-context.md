# AI Service Desk — product context

Baseline: 2026-09-16; implemented state is local `main` at `a0aeb0a` (Milestone 8). “CURRENT” means present in that code, not production readiness. “PLANNED” is a product decision or future direction, not an existing feature.

## Product and market

AI Service Desk is the product. Phone, email, SMS and webchat are optional channels/modules sharing the same customers, conversations, knowledge, bookings and business logic. A business should be able to adopt only the capabilities it needs.

Start with Swedish SMBs; automotive workshops are the first market wedge and pilot opportunity. Keep the core general-purpose and industry-neutral. Vehicles, registration numbers, workshop orders and other industry-specific concepts belong in later configuration/layers, not mandatory core fields.

The product should reduce missed customer contacts and staff workload while making correct bookings and reliably handing uncertain work to people. Validate willingness to pay and time saved with real businesses; plan names, prices and usage allowances are not settled.

## Shared domain vocabulary

| Concept | Responsibility and status |
| --- | --- |
| Organizations | CURRENT: tenant boundary, linked to a Clerk organization. |
| Users / Roles | CURRENT: Clerk identity, membership and roles; minimal local user projection. Roles accepted today: `org:admin`, `org:member`. |
| Customers | CURRENT: tenant-owned people or business customers, optional contact details. |
| Services | CURRENT: structured offerings, optional duration, explicit pricing. |
| Conversation | CURRENT: channel-agnostic interaction history, with messages and activity events. |
| Service Request | PLANNED: primary work object representing what the customer wants done, from intake through estimate/assessment/booking/quote/work/completion. No current implementation. |
| Case | CURRENT backend; secondary product role: exception/support/attention object for matters outside the Service Request flow or internal follow-up. |
| Inbox | PLANNED: unified operator work surface, primarily Service Requests needing attention/next action, plus genuine Cases/exceptions. |
| Knowledge | CURRENT: tenant-owned FAQ/policy text and search; structured Services remain the pricing source. |
| Bookings | CURRENT: internal bookings and basic conflict checks. Resources, calendar UX and external providers are PLANNED. |
| Workflows | PLANNED: general event/trigger/action behavior; no workflow engine exists. |
| AI Configuration | PLANNED: tenant language, tone, enabled tools, autonomy and handoff policies; current orchestrator uses a fixed server instruction. |
| Integrations | PLANNED: business-system and channel adapters; no production channel integration exists on main. |

## Service Request principle — PLANNED

Minimize administration: keep the same Service Request from the first customer need through completion. Do not require a job to bounce Conversation -> Case -> Service Request -> Booking. Conversations retain interaction history; bookings represent appointments associated with the work.

Typical flow: customer contact -> AI creates/links Service Request -> structured intake and known/missing information -> safe known price or preliminary estimate when allowed -> required checks/assessment -> assessment booking if appropriate -> business inspects and updates the Service Request -> quote if needed -> customer accepts -> work is scheduled -> completed. An assessment appointment can be a site visit, consultation, diagnostic, measurement or inspection, free or paid depending on the service.

The planned core holds service/template-specific intake answers, known vs missing information, required checks/inspection requirements, attention state/reason and next action. Illustrative actions include `ASK_CUSTOMER`, `BOOK_ASSESSMENT`, `HUMAN_REVIEW`, `SEND_ESTIMATE`, `CREATE_QUOTE` and `WAIT`; these are not finalized API enums. Keep the MVP lifecycle simple, not a giant workflow engine. Future industry templates supply fields such as vehicle details, room size or electrical panel information without industry-specific columns in the general core.

Human attention does not require a separate Case: preserve the same Service Request wherever possible. Cases remain secondary for complaints, invoice disputes, requests to speak to an owner/staff, unrelated support or true exceptions; the existing Case backend remains valid. If a Case becomes a service job, link/convert/continue into a Service Request while preserving context, rather than closing context and duplicating administration. This is product direction, not an implemented conversion feature.

Pricing terms are distinct:

- **Price:** known structured service price/fact; structured Services exist today.
- **Estimate:** preliminary amount/range based on current information and stated assumptions, clearly non-final.
- **Quote:** formal offer/business document, potentially requiring human approval. AI must not silently turn an estimate into a binding quote.

Estimate/Quote handling and the Service Request concepts above are PLANNED, not current features.

## Product UX direction — PLANNED

- Make daily operation simple for nontechnical owners and staff. Use progressive complexity: useful defaults first, advanced configuration only when needed. Desktop-first with responsive layouts.
- Use one Inbox across channels as an exception/next-action work surface, not merely a chronological message list. Prioritize Service Requests needing attention plus genuine Cases/exceptions, retaining related conversation, customer and booking context. Resolved AI-handled conversations remain accessible without dominating the queue. Existing consoles are development surfaces, not this finished experience.
- Give staff a concise AI handoff summary: what the customer wants, what AI collected/did, missing information/checks, preliminary price/estimate when allowed, why human attention is needed and the recommended next action. Preserve the same Service Request through handoff where possible.
- Make booking feel like a calendar: day/week views, understandable appointments and eventually resource columns. Do not expose database IDs or raw timestamps as the workflow.
- Explain AI activity in everyday language: “Checked availability” and “Created booking,” with traceable outcomes. Do not show raw tool arguments or prompts.
- Guide onboarding through business details, services/prices, opening hours, knowledge, booking connection, selected channels, AI permissions, testing and activation. Industry selection must not make the core industry-specific.
- Give each channel a clear setup/status/test flow, including when AI should answer and how staff can take over. Adapt navigation to capabilities and user permissions; backend checks remain mandatory.
- Establish shadcn/ui as the component foundation with our own typography, spacing, density, status language and product identity. Follow existing project conventions; avoid unnecessary component-framework migrations. The current main branch has Tailwind-based consoles, not an installed shadcn/Radix design system.

## Commercial and AI boundaries — PLANNED

Clerk owns authentication, organizations, memberships and roles. Stripe direct is the billing/subscription direction; Clerk Billing is not the chosen billing architecture. Our own entitlement/capability layer translates plans into product features. Keep Stripe product/price IDs inside the billing integration, not scattered through business logic. Billing and entitlements are not implemented.

Permissions answer **who may perform an action**; capabilities/entitlements answer **what the organization has access to**. Enabling a paid feature must never confer a user's permission, and an admin role must not implicitly unlock paid features.

ElevenLabs is voice infrastructure, not the AI business-logic brain. Our orchestrator and Secure Tool Layer remain the single business-logic path across channels.

Booking will support a general Resources model (staff, rooms, equipment) and a booking-provider abstraction. Internal and external booking systems should expose the same AI tool contract; the organization selects the provider. Do not introduce industry-specific resource tables as the general model.

AI autonomy will distinguish read/free actions, writes requiring explicit customer confirmation, and actions requiring a human. Exact policies will be tenant-configurable and enforced by server logic. These confirmation/policy mechanisms are not implemented. Read/write classification exists today but is not a partial customer-confirmation/consent engine. Pilot direction is observe/draft mode, then safe automation before wider autonomy.

## How coding agents should use these docs

Before substantial work, read all four: [product context](product-context.md), [architecture](architecture.md), [roadmap](roadmap.md), and [security invariants](security-invariants.md). Then inspect current code, relevant tests and Git status/history; docs do not replace implementation checks. Preserve invariants, keep planned features distinct from implemented ones, and update these docs when architecture, roadmap or product decisions materially change. Follow the existing root `AGENTS.md` for framework guidance.

Use isolated branches for experiments. The voice spike is not a dependency of main; do not bring it into a feature/docs branch accidentally.

## Source basis

Reconciled against the AI Service Desk Project conversation **Välj rätt kontostrategi** (`6aa7a4b2-d9a8-83ed-bfac-771af2792903`, full paginated history), its attached tutorial/reference material, and this repository's code/history. Later explicit project decisions supersede earlier proposals: risk-first roadmap, Stripe direct, a shared custom AI brain, and the post-review decision that Service Request is the primary work object with Cases secondary. The synced Project `sources/` directory was empty at review.

This repository began independently with Create Next App (`bd12e3b`). The earlier AI Receptionist tutorial/demo is reference material only; the project decision is independent implementation, not copying that demo's code, UI, prompts or configuration into this product.
