import { mutation } from "./_generated/server";
import {
  getActiveClerkOrganization,
  requireAuthenticatedIdentity,
} from "./tenant";
import { ensureTenantConfiguration } from "./configuration";

/**
 * Creates the local application records for the verified active Clerk tenant.
 * There are deliberately no client-supplied user, organization, or role args.
 */
export const ensureCurrentTenant = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const activeOrganization = getActiveClerkOrganization(identity);

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrganizationId", (q) =>
        q.eq("clerkOrganizationId", activeOrganization.clerkOrganizationId),
      )
      .unique();

    if (organization === null) {
      const organizationId = await ctx.db.insert("organizations", {
        clerkOrganizationId: activeOrganization.clerkOrganizationId,
        ...(activeOrganization.clerkOrganizationSlug
          ? { slug: activeOrganization.clerkOrganizationSlug }
          : {}),
        status: "active",
      });
      organization = await ctx.db.get("organizations", organizationId);
    } else if (
      activeOrganization.clerkOrganizationSlug !== undefined &&
      organization.slug !== activeOrganization.clerkOrganizationSlug
    ) {
      await ctx.db.patch("organizations", organization._id, {
        slug: activeOrganization.clerkOrganizationSlug,
      });
      organization = await ctx.db.get("organizations", organization._id);
    }

    if (organization === null || organization.status !== "active") {
      throw new Error("The active organization is unavailable");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) =>
        q.eq("authTokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (user === null) {
      await ctx.db.insert("users", {
        authTokenIdentifier: identity.tokenIdentifier,
        ...(identity.name ? { displayName: identity.name } : {}),
        ...(identity.email ? { email: identity.email } : {}),
      });
    }

    await ensureTenantConfiguration(
      ctx,
      organization,
      identity.tokenIdentifier,
    );

    return {
      organizationId: organization._id,
      role: activeOrganization.role,
    };
  },
});
