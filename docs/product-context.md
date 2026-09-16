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
| Conversations / Cases | CURRENT: customer-contact history, messages, activity events and follow-up cases. Full unified Inbox/handoff UX is PLANNED. |
| Knowledge | CURRENT: tenant-owned FAQ/policy text and search; structured Services remain the pricing source. |
| Bookings | CURRENT: internal bookings and basic conflict checks. Resources, calendar UX and external providers are PLANNED. |
| Workflows | PLANNED: general event/trigger/action behavior; no workflow engine exists. |
| AI Configuration | PLANNED: tenant language, tone, enabled tools, autonomy and handoff policies; current orchestrator uses a fixed server instruction. |
| Integrations | PLANNED: business-system and channel adapters; no production channel integration exists on main. |

## Product UX direction — PLANNED

- Make daily operation simple for nontechnical owners and staff. Use progressive complexity: useful defaults first, advanced configuration only when needed. Desktop-first with responsive layouts.
- Use one Inbox/Cases experience across channels, with a conversation timeline and related customer, booking, status and follow-up context. Existing consoles are development surfaces, not this finished experience.
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

AI autonomy will distinguish read/free actions, writes requiring explicit customer confirmation, and actions requiring a human. Exact policies will be tenant-configurable and enforced by server logic. These confirmation/policy mechanisms are not fully implemented: the current read/write classification is not a consent system. Pilot direction is observe/draft mode, then safe automation before wider autonomy.

## How coding agents should use these docs

Before substantial work, read all four: [product context](product-context.md), [architecture](architecture.md), [roadmap](roadmap.md), and [security invariants](security-invariants.md). Then inspect current code, relevant tests and Git status/history; docs do not replace implementation checks. Preserve invariants, keep planned features distinct from implemented ones, and update these docs when architecture, roadmap or product decisions materially change. Follow the existing root `AGENTS.md` for framework guidance.

Use isolated branches for experiments. The voice spike is not a dependency of main; do not bring it into a feature/docs branch accidentally.

## Source basis

Reconciled against the AI Service Desk Project conversation **Välj rätt kontostrategi** (`6aa7a4b2-d9a8-83ed-bfac-771af2792903`, full paginated history), its attached tutorial/reference material, and this repository's code/history. Later explicit project decisions supersede earlier proposals: risk-first roadmap, Stripe direct and a shared custom AI brain. The synced Project `sources/` directory was empty at review.

This repository began independently with Create Next App (`bd12e3b`). The earlier AI Receptionist tutorial/demo is reference material only; the project decision is independent implementation, not copying that demo's code, UI, prompts or configuration into this product.
