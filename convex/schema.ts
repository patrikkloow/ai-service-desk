import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    .index("by_organizationId_and_status", ["organizationId", "status"]),

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

});
