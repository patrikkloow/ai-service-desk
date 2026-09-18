import { mutation, query } from "./_generated/server";
import {
  aiActionPolicies,
  communicationTone,
  responseLanguage,
} from "./configValidators";
import {
  auditConfigurationUpdate,
  getTenantConfiguration,
} from "./configuration";
import { requireCurrentTenant, requireCurrentTenantAdmin } from "./tenant";

export type PolicyAction =
  | "booking.create"
  | "booking.reschedule"
  | "booking.cancel"
  | "case.create"
  | "human.escalate";
export type PolicyDecision =
  "allowed" | "needs_customer_confirmation" | "needs_human";

const actionKey = {
  "booking.create": "bookingCreate",
  "booking.reschedule": "bookingReschedule",
  "booking.cancel": "bookingCancel",
  "case.create": "caseCreate",
} as const;

/**
 * Central fail-safe evaluator. M11 has no trusted external customer-session
 * evidence, so confirmation-required actions stay blocked. Model/client claims
 * are deliberately absent from this API.
 */
export function evaluateActionPolicy(
  policy: unknown,
  action: string,
): PolicyDecision {
  if (action === "human.escalate") return "allowed";
  if (!(action in actionKey) || policy === null || typeof policy !== "object")
    return "needs_human";
  const key = actionKey[action as keyof typeof actionKey];
  const value = (policy as Record<string, unknown>)[key];
  if (value === "allow") return "allowed";
  if (value === "confirm") return "needs_customer_confirmation";
  return "needs_human";
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireCurrentTenant(ctx);
    return {
      policy: await getTenantConfiguration(
        ctx,
        "aiPolicies",
        tenant.organization._id,
      ),
      canEdit: tenant.role === "org:admin",
    };
  },
});

export const update = mutation({
  args: {
    actions: aiActionPolicies,
    responseLanguage,
    communicationTone,
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const current = await getTenantConfiguration(
      ctx,
      "aiPolicies",
      tenant.organization._id,
    );
    if (current === null) throw new Error("AI policy is unavailable");
    await ctx.db.replace("aiPolicies", current._id, {
      organizationId: current.organizationId,
      actions: args.actions,
      responseLanguage: args.responseLanguage,
      communicationTone: args.communicationTone,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    await auditConfigurationUpdate(
      ctx,
      tenant.organization._id,
      tenant.identity.tokenIdentifier,
      "ai_policy",
    );
  },
});
