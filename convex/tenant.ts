import type { UserIdentity } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type TenantContext = QueryCtx | MutationCtx;

export type TenantRole = "org:admin" | "org:member";

type ActiveClerkOrganization = {
  clerkOrganizationId: string;
  clerkOrganizationSlug?: string;
  role: TenantRole;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toTenantRole(value: unknown): TenantRole | null {
  if (value === "admin" || value === "org:admin") {
    return "org:admin";
  }

  if (value === "member" || value === "org:member") {
    return "org:member";
  }

  return null;
}

/**
 * Reads the active Clerk organization exclusively from verified JWT claims.
 * Clerk session token v2 exposes this compact organization claim as `o`.
 */
export function getActiveClerkOrganization(
  identity: UserIdentity,
): ActiveClerkOrganization {
  const organizationClaim = asRecord(identity.o);
  const role = organizationClaim ? toTenantRole(organizationClaim.rol) : null;

  if (
    organizationClaim === null ||
    typeof organizationClaim.id !== "string" ||
    role === null
  ) {
    throw new Error("An active Clerk organization is required");
  }

  return {
    clerkOrganizationId: organizationClaim.id,
    ...(typeof organizationClaim.slg === "string"
      ? { clerkOrganizationSlug: organizationClaim.slg }
      : {}),
    role,
  };
}

export async function requireAuthenticatedIdentity(
  ctx: TenantContext,
): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new Error("Not authenticated");
  }

  return identity;
}

/**
 * Resolves the local tenant from the authenticated user's active Clerk
 * organization. Future tenant-scoped functions must call this helper instead
 * of accepting an organization ID from the client.
 */
export async function requireCurrentTenant(ctx: TenantContext): Promise<{
  identity: UserIdentity;
  organization: Doc<"organizations">;
  role: TenantRole;
}> {
  const identity = await requireAuthenticatedIdentity(ctx);
  const activeOrganization = getActiveClerkOrganization(identity);
  const organization = await ctx.db
    .query("organizations")
    .withIndex("by_clerkOrganizationId", (q) =>
      q.eq("clerkOrganizationId", activeOrganization.clerkOrganizationId),
    )
    .unique();

  if (organization === null) {
    throw new Error("The active organization has not been provisioned");
  }

  if (organization.status !== "active") {
    throw new Error("The active organization is unavailable");
  }

  return {
    identity,
    organization,
    role: activeOrganization.role,
  };
}
