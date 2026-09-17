import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  requestStatus,
  attentionState,
  nextAction,
  requestSummary,
} from "./workValidators";

/**
 * The tenant foundation for the platform. Domain-specific records belong to
 * an organization through this model rather than defining a vertical here.
 */
export default defineSchema({
  organizations: defineTable({
    // Clerk owns the organization identity, membership, and roles.
    clerkOrganizationId: v.string(),
    // These are optional local display values. They do not authorize access.
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("suspended")),
    defaultLocale: v.optional(v.string()),
    timeZone: v.optional(v.string()),
  })
    .index("by_clerkOrganizationId", ["clerkOrganizationId"])
    .index("by_slug", ["slug"]),

  users: defineTable({
    // Derived server-side from the verified Clerk token identifier.
    authTokenIdentifier: v.string(),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_authTokenIdentifier", ["authTokenIdentifier"]),

  customers: defineTable({
    // Always derived server-side from the authenticated Clerk organization.
    organizationId: v.id("organizations"),
    // A single required name supports both people and business customers.
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_organizationId_and_name_and_status", [
      "organizationId",
      "name",
      "status",
    ])
    .index("by_organizationId_and_email_and_status", [
      "organizationId",
      "email",
      "status",
    ])
    .index("by_organizationId_and_phone_and_status", [
      "organizationId",
      "phone",
      "status",
    ]),

  services: defineTable({
    // Always derived server-side from the authenticated Clerk organization.
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    pricing: v.union(
      v.object({ kind: v.literal("not_specified") }),
      v.object({
        kind: v.literal("fixed"),
        amountMinor: v.number(),
        currency: v.string(),
      }),
      v.object({
        kind: v.literal("from"),
        amountMinor: v.number(),
        currency: v.string(),
      }),
    ),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_status", ["organizationId", "status"]),

  bookings: defineTable({
    // Always derived server-side from the authenticated Clerk organization.
    organizationId: v.id("organizations"),
    customerId: v.id("customers"),
    serviceId: v.id("services"),
    // These snapshots preserve booking history when source records change.
    customerName: v.string(),
    serviceName: v.string(),
    servicePricing: v.union(
      v.object({ kind: v.literal("not_specified") }),
      v.object({
        kind: v.literal("fixed"),
        amountMinor: v.number(),
        currency: v.string(),
      }),
      v.object({
        kind: v.literal("from"),
        amountMinor: v.number(),
        currency: v.string(),
      }),
    ),
    // Absolute Unix timestamps in milliseconds. UI formatting is locale-specific.
    startTime: v.number(),
    endTime: v.number(),
    status: v.union(
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("completed"),
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_startTime", ["organizationId", "startTime"])
    .index("by_organizationId_and_status_and_startTime", [
      "organizationId",
      "status",
      "startTime",
    ]),

  knowledgeEntries: defineTable({
    // Always derived server-side from the authenticated Clerk organization.
    organizationId: v.id("organizations"),
    title: v.string(),
    content: v.string(),
    // Maintained server-side as a search projection of title and content.
    searchText: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .searchIndex("search_by_searchText_and_organizationId_and_status", {
      searchField: "searchText",
      filterFields: ["organizationId", "status"],
    }),

  conversations: defineTable({
    // Always derived server-side from the authenticated Clerk organization.
    organizationId: v.id("organizations"),
    customerId: v.optional(v.id("customers")),
    channel: v.union(
      v.literal("web"),
      v.literal("sms"),
      v.literal("phone"),
      v.literal("email"),
      v.literal("other"),
    ),
    subject: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"])
    .index("by_organizationId_and_status_and_updatedAt", [
      "organizationId",
      "status",
      "updatedAt",
    ])
    .index("by_organizationId_and_customerId_and_updatedAt", [
      "organizationId",
      "customerId",
      "updatedAt",
    ]),

  conversationMessages: defineTable({
    organizationId: v.id("organizations"),
    conversationId: v.id("conversations"),
    senderType: v.union(
      v.literal("customer"),
      v.literal("ai"),
      v.literal("human"),
      v.literal("system"),
    ),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_organizationId_and_conversationId_and_createdAt", [
    "organizationId",
    "conversationId",
    "createdAt",
  ]),

  conversationEvents: defineTable({
    organizationId: v.id("organizations"),
    conversationId: v.id("conversations"),
    type: v.union(
      v.literal("conversation_created"),
      v.literal("customer_linked"),
      v.literal("case_created"),
      v.literal("booking_created"),
      v.literal("booking_rescheduled"),
      v.literal("booking_cancelled"),
      v.literal("human_escalated"),
      v.literal("resolved"),
      v.literal("reopened"),
    ),
    // Provenance is intentionally limited to a safe entity reference. Tool
    // inputs, prompts, customer contact data, and message content are never
    // stored in the activity timeline.
    entityType: v.optional(v.union(v.literal("booking"), v.literal("case"))),
    entityId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_organizationId_and_conversationId_and_createdAt", [
    "organizationId",
    "conversationId",
    "createdAt",
  ]),

  serviceRequests: defineTable({
    organizationId: v.id("organizations"),
    customerId: v.optional(v.id("customers")),
    serviceId: v.optional(v.id("services")),
    // Initial context only; additional conversations can be related later.
    initialConversationId: v.optional(v.id("conversations")),
    bookingId: v.optional(v.id("bookings")),
    title: v.string(),
    summary: requestSummary,
    status: requestStatus,
    attention: attentionState,
    attentionReason: v.optional(v.string()),
    nextAction,
    acknowledgedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"])
    .index("by_organizationId_and_attention_and_updatedAt", [
      "organizationId",
      "attention",
      "updatedAt",
    ])
    .index("by_organizationId_and_initialConversationId", [
      "organizationId",
      "initialConversationId",
    ]),

  workEvents: defineTable({
    organizationId: v.id("organizations"),
    target: v.union(v.id("serviceRequests"), v.id("cases")),
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("linked"),
      v.literal("requested"),
      v.literal("acknowledged"),
      v.literal("resolved"),
    ),
    actor: v.string(), // Verified tokenIdentifier, never an access token.
    createdAt: v.number(),
  }).index("by_organizationId_and_target_and_createdAt", [
    "organizationId",
    "target",
    "createdAt",
  ]),

  cases: defineTable({
    serviceRequestId: v.optional(v.id("serviceRequests")),
    acknowledgedBy: v.optional(v.string()),
    organizationId: v.id("organizations"),
    conversationId: v.optional(v.id("conversations")),
    customerId: v.optional(v.id("customers")),
    title: v.string(),
    description: v.optional(v.string()),
    // Only set by the human escalation tool. This supports retry-safe
    // escalation without making ordinary cases tool-specific.
    source: v.optional(v.literal("human_escalation")),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high")),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"])
    .index("by_organizationId_and_status_and_updatedAt", [
      "organizationId",
      "status",
      "updatedAt",
    ])
    .index("by_organizationId_and_customerId_and_updatedAt", [
      "organizationId",
      "customerId",
      "updatedAt",
    ])
    .index("by_organizationId_and_conversationId_and_updatedAt", [
      "organizationId",
      "conversationId",
      "updatedAt",
    ])
    .index("by_organizationId_and_serviceRequestId_and_status_and_updatedAt", [
      "organizationId",
      "serviceRequestId",
      "status",
      "updatedAt",
    ])
    .index("by_organizationId_and_conversationId_and_source_and_status", [
      "organizationId",
      "conversationId",
      "source",
      "status",
    ]),
});
