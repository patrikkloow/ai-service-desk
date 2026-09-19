# Security invariants

These MUST/MUST NOT rules govern new work and preservation of existing boundaries. They are not a claim that every future subsystem exists. Updated implementation: Booking System v1 based on main `3648568`, 2026-09-19; see [architecture.md](architecture.md) for current limits.

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
- AI MUST NOT claim an action/write succeeded without a successful tool/backend result confirming it. CURRENT enforcement: arbitrary model final prose is not published. The server composes write confirmations only from successful server results with matching references/status, and ends the turn after a write attempt. Structured read finalization validates current-turn evidence; knowledge is an attributed excerpt, not action/price authority. Relevance, source correctness and intent matching are not generically semantically verified.
- Unknown business facts/prices MUST NOT be invented; use structured Services for pricing and Knowledge for policies/FAQ. Future Estimates MUST be clearly preliminary and disclose relevant assumptions; AI MUST NOT silently present an Estimate as a binding Quote.
- Bounded context and tool iteration limits MUST be preserved. Future adapters MUST preserve safe errors and MUST NOT expose prompts, raw exceptions or hidden context to clients.
- Autonomous AI write behavior MUST enforce the tenant's customer-confirmation/human-required policy server-side. The read/write tool distinction, model output, client flags and conversation text MUST NOT be treated as proof of customer consent. Until trusted confirmation evidence exists, confirmation-required actions MUST remain blocked.

## Writes, retries and provenance

- Writes MUST preserve required audit/provenance without dumping PII. Conversation-linked tool actions MUST retain their minimal activity references. New audit coverage MUST be designed explicitly; current activity events are not a global audit log.
- An uncertain write result MUST NOT trigger a blind retry. Preserve duplicate resistance, booking conflict checks and escalation's reuse of an existing open case. Future external writes MUST define idempotency/reconciliation for uncertain outcomes.
- CURRENT: an AI write attempt ends the turn, preventing any automatic second write or post-write provider call. Staff calendar creation has a tenant-scoped persistent idempotency key; this MUST NOT be generalized into an exactly-once claim for other actions or external channels. A save failure after another write MUST warn that the action may already have happened.
- Conversation history MUST preserve append-only message semantics through current APIs. Human escalation MUST NOT automatically resolve the conversation or imply a completed human takeover.

## Secrets, privacy and experiments

- Server secrets, upstream credentials, API keys, authorization headers, server-side tokens not intended for clients and raw provider responses containing them MUST NOT be logged, exposed to browsers or committed. Server credentials MUST NOT use public client-exposed environment variables.
- Intentionally client-bound, short-lived session tokens required by authenticated integration flows MAY be delivered to the intended client/session. They MUST NOT be logged, persisted unnecessarily or leaked beyond that intended client/session.
- `.env.local` and other secret-bearing files MUST NEVER be committed. Inspect staged changes explicitly; do not stage local configuration by accident.
- Logs/telemetry MUST minimize personal data. Raw transcripts, message bodies, audio, prompts, contact data and raw tool arguments MUST NOT be copied into diagnostics unnecessarily. Authorized business-message storage is distinct from logging; access and retention must be considered when extending it.
- Production observability MUST favor safe timing/outcome metadata and tenant-safe access. In the voice spike, transcripts MUST remain ephemeral browser state, cleared on interruption/error/disconnect/exit; they MUST NOT enter logs or application persistence.
- Spike/dev-only routes and features MUST remain explicitly gated and unavailable in production. CURRENT UX shell: `/dev` checks development mode on the server and requires Clerk sign-in before rendering raw conversation/Case, tool and server-configured orchestrator consoles. Hiding navigation is not an authorization check. Operator routes and collapsed controls MUST preserve server-side Convex tenant checks and MUST NOT add client authority. Sign-in and upstream verification MUST NOT be weakened for convenience; ElevenLabs upstream JWT verification MUST stay enabled.
- Experimental voice behavior MUST NOT be represented as production functionality or silently merged with unrelated work. Preserve the main/spike separation until a deliberate review decides what to reuse.

## Verification expectations

For relevant code changes, test unauthorized access, multiple tenants, foreign record IDs, malformed/extra tool arguments and spoofed AI authorship. For orchestrator/write changes also exercise provider failure, loop limits, uncertain writes and duplicate escalation. Match testing to the change; documentation-only edits need diff/link/status checks, not a full application suite.

## M9 handoff enforcement

- Request ownership, referenced records, Inbox reads and handoff writes MUST use verified tenant context. Acknowledgment identity MUST come from `identity.tokenIdentifier`, never client-supplied user fields. This stable identity identifier is not a bearer token.
- New request summaries MUST remain bounded explicit business fields or deterministic event-derived descriptions. They MUST NOT store private chain-of-thought or copy transcripts into summaries/audit records. Authorized recent message display remains separate from summary generation.
- Linked Cases MUST remain accessible without becoming duplicate Inbox work. Existing escalation Case return values and duplicate resistance MUST be preserved. Request attention resolution MUST NOT implicitly resolve a Case, conversation or request lifecycle.
- Acknowledgment MUST NOT imply exclusive permissions, model cancellation or channel pause/resume. Current org members may resolve attention; replacing another member's acknowledgment is rejected.
- New work audit records MUST contain only the tenant, entity reference, action, verified actor identifier and timestamp. Do not interpret this as full historical audit coverage of legacy Case mutations.

## M10 provider and response boundary

- Runtime provider/model/credentials MUST be server-configured. Public requests MUST NOT accept model/provider/endpoint overrides. Missing live configuration MUST fail closed. Tests MUST default to fake and clear inherited live credentials; real smoke requires explicit opt-in.
- Provider tool output MUST pass both adapter normalization and the independent strict Tool Layer request parser. Provider function schemas are guidance, not authorization. Tenant/conversation context remains attached by the server.
- Authoritative write text MUST come only from successful tool results; free-form model text MUST NOT bypass the server renderer, including turns with no tool calls. Failed and uncertain outcomes MUST remain distinct from success. Do not relax this to prompt instructions or a keyword blacklist.
- Provider requests MUST have a bounded deadline/abort, bounded response body and no automatic retries. A write is terminal even when its outcome is uncertain. This is not a consent/policy engine or durable idempotency solution.
- Logs and console metadata MUST remain allowlisted: provider/model/mode, timing/counts, tool names/outcomes, controlled failure category and response-persistence status. Raw messages/results/arguments, contact data, entity references, credentials and hidden reasoning MUST NOT be added to diagnostics. Business conversation storage remains separate.
- M10 retains authenticated staff authority. No external customer target-record authorization, fine-grained role matrix or live pause/resume is implied. Successful tool execution proves the backend result, not that a model selected the correct customer intent/record/time.

## M11 configuration and autonomy policy boundary

- Business Profile, Business Hours and AI Policy records MUST remain tenant-scoped and resolved from verified server context. Configuration mutation authority MUST come from the verified `org:admin` role. UI visibility or disabled controls MUST NOT replace the backend role check.
- Missing, malformed or unknown action policy MUST fail to human handling. `human.escalate` MUST remain available as the safe fallback. A human-required policy may create/reuse the existing escalation record, but MUST NOT execute the original requested write or claim that staff have taken over.
- Confirmation-required actions MUST NOT execute until a later trusted channel/session boundary supplies verified confirmation evidence. Model/client-provided confirmation fields MUST be rejected as extra authority-bearing arguments. Current M11 behavior asks for confirmation but records no trusted confirmation state.
- `allow` policy MUST only authorize dispatch to the existing registered Tool Layer operation. Policy evaluation MUST NOT create arbitrary database/function dispatch or bypass domain ownership, validation, conflict and grounded-response checks.
- Tenant-authored profile descriptions, contact data and opening hours MUST be treated as untrusted business data. Current provider requests MUST receive only fixed tool descriptions and bounded enum-derived style instructions; raw configuration values MUST NOT be inserted into system instructions, diagnostic logs or provider result replay.
- Ordinary Business Hours are one required input to verified availability, together with resource schedules, service restrictions, blocks and bookings. They MUST NOT by themselves prove availability. Holiday, buffer, notice and external-provider rules remain separate future controls.
- Configuration audit events MUST stay minimal: tenant, domain, action, verified actor identifier and timestamp. They MUST NOT copy contact fields, descriptions, schedules, policy values or other unnecessary tenant content.
- M11 policy protects AI orchestration, not direct staff operations or future public-channel authorization. External customer actions still require target-record authorization in addition to tenant/session routing and autonomy policy.

## Booking System v1 boundary

- Every new booking MUST resolve to one active resource owned by the verified tenant. Resource IDs are target references only; they MUST NOT select tenant, actor or permission. Historical resource snapshots may remain visible after a resource is inactivated.
- Resource, weekly schedule, service-restriction and blocked-time mutations MUST require verified `org:admin`. Verified tenant members may read resource configuration and create bookings through staff APIs. UI-disabled controls MUST NOT replace these backend checks.
- Staff and AI create/reschedule paths MUST call the same resource availability domain logic. AI MUST first pass M11 action policy and strict Tool Layer validation. Neither model output nor client arguments may claim a staff actor or bypass policy. The staff calendar may pass an explicit schedule-override capability after authenticated user confirmation; AI/tool schemas and ordinary booking APIs MUST NOT expose it.
- Availability MUST enforce active status, service eligibility, configured Business Hours and resource schedule in the business timezone, blocked intervals and half-open confirmed-booking conflicts in the same Convex mutation as a write. A staff override may bypass only the two weekly schedule-coverage checks and MUST write verified-actor audit metadata. It MUST NOT bypass missing resource configuration, blocks, conflicts, ownership, status or service eligibility. A block overlapping a confirmed booking MUST be rejected and MUST NOT cancel the booking.
- Confirmed legacy bookings without `resourceId` MUST remain visible and MUST conservatively block every resource during their interval until a verified staff user explicitly assigns an eligible resource. Migration or arbitrary automatic assignment MUST NOT be inferred.
- Calendar range reads MUST derive tenant server-side, bound the requested date span and include exact overlaps that begin before the visible range. A hidden result limit MUST NOT make an occupied time appear free.
- Calendar reschedules MUST carry a server-issued booking version and reject stale writes in the mutation. UI drag failures MUST revert to live server state and MUST NOT retry blindly. Event resizing is disabled; duration and resource stay unchanged during drag.
- Staff-create idempotency keys MUST be scoped by tenant and bound to a normalized request fingerprint. Reusing a key with changed customer, service, resource, request, time or notes MUST fail. Customer creation and booking creation MUST stay in one transaction so a rejected booking does not leave a duplicate customer.
- `businessProfiles.timezone` is authoritative for staff local-date input and resource weekly schedules. Nonexistent or ambiguous DST local times MUST be rejected rather than silently shifted or guessed.
- Resource block notes are internal and MUST NOT be returned by AI availability tools or external customer responses. Calendar code and FullCalendar MUST remain presentation clients; they MUST NOT own authorization, capacity or conflict rules.
- Linking a booking to a Service Request MUST verify tenant plus compatible customer/service references. Booking status changes MUST NOT automatically complete or otherwise transition the request lifecycle.
- Permanent service deletion MUST require verified `org:admin`, derive tenant server-side and check confirmed bookings, every Service Request and every resource link in the same mutation. Those references MUST reject deletion without cascade or automatic unlinking. Completed/cancelled bookings MUST remain intact through their stored service snapshots when their catalog service is deleted. Existing edit/status permissions remain unchanged.
