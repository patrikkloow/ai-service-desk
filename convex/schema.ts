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

});
