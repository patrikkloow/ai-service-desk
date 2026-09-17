# Security invariants

These MUST/MUST NOT rules govern new work and preservation of existing boundaries. They are not a claim that every future subsystem exists. Updated implementation: Milestone 9 based on main `b8a492c`, 2026-09-17; see [architecture.md](architecture.md) for current limits.

## Tenant identity and authorization

- Tenant identity MUST be derived server-side from verified Clerk authentication and active organization context. Tenant-scoped Convex functions MUST use `requireCurrentTenant()` or an equally verified server path, reject unavailable/suspended tenants and preserve the Clerk-to-internal-organization mapping.
- Authorization MUST NOT trust client-provided `orgId`/`organizationId`, `userId`, role, prompt claims, URL parameters or local display fields. Clerk owns identity, membership and roles; local projections MUST NOT become another authority.
- Every record accessed by ID MUST be checked for tenant ownership, including related customers, services, bookings, conversations, cases and service requests. List/search operations MUST constrain by the derived tenant. An ID's validity is not authorization.
- Future external/customer-facing actions MUST authorize the customer for the specific target record and action in addition to tenant/conversation routing. Tenant routing alone is insufficient; it MUST NOT confer permission to mutate every booking or other record in that tenant.
- Roles/permissions MUST remain separate from capabilities/entitlements. When capabilities are introduced, enforcement MUST happen on the backend as well as in the UI. A paid plan MUST NOT grant a user role, and a role MUST NOT imply a paid capability.
- Future public channel entry points MUST authenticate/verify their provider or session and derive tenant routing through trusted server mappings. They MUST NOT turn the current signed-in APIs into unauthenticated endpoints for convenience. Customer identity linking MUST NOT rely on weak matches alone.

## AI and Tool Layer

- AI/model adapters MUST NOT bypass the explicit Tool Layer/registry, access the database directly or select arbitrary backend functions. Business writes MUST use named domain operations and preserve their validation/conflict rules.
- Tool input validation MUST be strict, bounded and allowlisted. Extra authority-bearing arguments MUST be rejected. The server MUST attach the authorized active conversation for orchestrator tool calls; the model MUST NOT override that context.
- Customer/user content, retrieved knowledge and provider/model output MUST be treated as untrusted data. Prompt text is behavioral guidance, never a hard security boundary. Authorization, validation and policy decisions MUST be enforced in server code.
- AI-authored messages/actions and their provenance MUST be server-controlled. Clients MUST NOT label arbitrary messages as `ai` or `system`, inject trusted tool results or claim an action succeeded. Current public message append permits only customer/human messages under tenant authorization.
- AI MUST NOT claim an action/write succeeded without a successful tool/backend result confirming it. CURRENT limitation: the orchestrator validates final text format/length but does not yet generically semantically verify it against tool results. Closing this gap is a required future hardening/evaluation target, especially for Milestone 10 live LLM/evals.
- Unknown business facts/prices MUST NOT be invented; use structured Services for pricing and Knowledge for policies/FAQ. Future Estimates MUST be clearly preliminary and disclose relevant assumptions; AI MUST NOT silently present an Estimate as a binding Quote.
- Bounded context and tool iteration limits MUST be preserved. Future adapters MUST preserve safe errors and MUST NOT expose prompts, raw exceptions or hidden context to clients.
- New autonomous write behavior MUST enforce the chosen customer-confirmation/human-required policy server-side. The read/write tool distinction MUST NOT be treated as proof of customer consent. Configurable confirmation policies are still planned.

## Writes, retries and provenance

- Writes MUST preserve required audit/provenance without dumping PII. Conversation-linked tool actions MUST retain their minimal activity references. New audit coverage MUST be designed explicitly; current activity events are not a global audit log.
- An uncertain write result MUST NOT trigger a blind retry. Preserve duplicate resistance, booking conflict checks and escalation's reuse of an existing open case. Future external writes MUST define idempotency/reconciliation for uncertain outcomes.
- Current retry blocking is only for the same uncertain write request inside one orchestration turn. Agents MUST NOT claim durable exactly-once execution, general idempotency keys or cross-turn deduplication already exist.
- Conversation history MUST preserve append-only message semantics through current APIs. Human escalation MUST NOT automatically resolve the conversation or imply a completed human takeover.

## Secrets, privacy and experiments

- Server secrets, upstream credentials, API keys, authorization headers, server-side tokens not intended for clients and raw provider responses containing them MUST NOT be logged, exposed to browsers or committed. Server credentials MUST NOT use public client-exposed environment variables.
- Intentionally client-bound, short-lived session tokens required by authenticated integration flows MAY be delivered to the intended client/session. They MUST NOT be logged, persisted unnecessarily or leaked beyond that intended client/session.
- `.env.local` and other secret-bearing files MUST NEVER be committed. Inspect staged changes explicitly; do not stage local configuration by accident.
- Logs/telemetry MUST minimize personal data. Raw transcripts, message bodies, audio, prompts, contact data and raw tool arguments MUST NOT be copied into diagnostics unnecessarily. Authorized business-message storage is distinct from logging; access and retention must be considered when extending it.
- Production observability MUST favor safe timing/outcome metadata and tenant-safe access. In the voice spike, transcripts MUST remain ephemeral browser state, cleared on interruption/error/disconnect/exit; they MUST NOT enter logs or application persistence.
- Spike/dev-only routes and features MUST remain explicitly gated and unavailable in production. CURRENT UX shell: `/dev` checks development mode on the server and requires Clerk sign-in before rendering raw conversation/Case, tool and fake-orchestrator consoles. Hiding navigation is not an authorization check. Operator routes and collapsed controls MUST preserve server-side Convex tenant checks and MUST NOT add client authority. Sign-in and upstream verification MUST NOT be weakened for convenience; ElevenLabs upstream JWT verification MUST stay enabled.
- Experimental voice behavior MUST NOT be represented as production functionality or silently merged with unrelated work. Preserve the main/spike separation until a deliberate review decides what to reuse.

## Verification expectations

For relevant code changes, test unauthorized access, multiple tenants, foreign record IDs, malformed/extra tool arguments and spoofed AI authorship. For orchestrator/write changes also exercise provider failure, loop limits, uncertain writes and duplicate escalation. Match testing to the change; documentation-only edits need diff/link/status checks, not a full application suite.

## M9 handoff enforcement

- Request ownership, referenced records, Inbox reads and handoff writes MUST use verified tenant context. Acknowledgment identity MUST come from `identity.tokenIdentifier`, never client-supplied user fields. This stable identity identifier is not a bearer token.
- New request summaries MUST remain bounded explicit business fields or deterministic event-derived descriptions. They MUST NOT store private chain-of-thought or copy transcripts into summaries/audit records. Authorized recent message display remains separate from summary generation.
- Linked Cases MUST remain accessible without becoming duplicate Inbox work. Existing escalation Case return values and duplicate resistance MUST be preserved. Request attention resolution MUST NOT implicitly resolve a Case, conversation or request lifecycle.
- Acknowledgment MUST NOT imply exclusive permissions, model cancellation or channel pause/resume. Current org members may resolve attention; replacing another member's acknowledgment is rejected.
- New work audit records MUST contain only the tenant, entity reference, action, verified actor identifier and timestamp. Do not interpret this as full historical audit coverage of legacy Case mutations.
