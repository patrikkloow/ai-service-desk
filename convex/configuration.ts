import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const CLOSED_WEEK = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
} satisfies Doc<"businessHours">["schedule"];

export const SAFE_DEFAULT_ACTIONS = {
  bookingCreate: "confirm",
  bookingReschedule: "confirm",
  bookingCancel: "human",
  caseCreate: "allow",
} satisfies Doc<"aiPolicies">["actions"];

type ConfigCtx = QueryCtx | MutationCtx;

export function getTenantConfiguration(
  ctx: ConfigCtx,
  table: "businessProfiles",
  organizationId: Id<"organizations">,
): Promise<Doc<"businessProfiles"> | null>;
export function getTenantConfiguration(
  ctx: ConfigCtx,
  table: "businessHours",
  organizationId: Id<"organizations">,
): Promise<Doc<"businessHours"> | null>;
export function getTenantConfiguration(
  ctx: ConfigCtx,
  table: "aiPolicies",
  organizationId: Id<"organizations">,
): Promise<Doc<"aiPolicies"> | null>;
export async function getTenantConfiguration(
  ctx: ConfigCtx,
  table: "businessProfiles" | "businessHours" | "aiPolicies",
  organizationId: Id<"organizations">,
) {
  switch (table) {
    case "businessProfiles":
      return await ctx.db
        .query("businessProfiles")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique();
    case "businessHours":
      return await ctx.db
        .query("businessHours")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique();
    case "aiPolicies":
      return await ctx.db
        .query("aiPolicies")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique();
  }
}

async function configurationAudit(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  actor: string,
  domain: Doc<"configurationEvents">["domain"],
  action: Doc<"configurationEvents">["action"],
) {
  await ctx.db.insert("configurationEvents", {
    organizationId,
    actor,
    domain,
    action,
    createdAt: Date.now(),
  });
}

export async function auditConfigurationUpdate(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  actor: string,
  domain: Doc<"configurationEvents">["domain"],
) {
  await configurationAudit(ctx, organizationId, actor, domain, "updated");
}

export async function ensureTenantConfiguration(
  ctx: MutationCtx,
  organization: Doc<"organizations">,
  actor: string,
) {
  const now = Date.now();
  if (
    (await getTenantConfiguration(
      ctx,
      "businessProfiles",
      organization._id,
    )) === null
  ) {
    await ctx.db.insert("businessProfiles", {
      organizationId: organization._id,
      configured: false,
      companyName: organization.name?.trim() || organization.slug?.trim() || "",
      timezone: validTimezone(organization.timeZone)
        ? organization.timeZone!
        : "Europe/Stockholm",
      defaultLanguage: normalizedLanguage(organization.defaultLocale) ?? "sv",
      createdAt: now,
      updatedAt: now,
    });
    await configurationAudit(
      ctx,
      organization._id,
      actor,
      "business_profile",
      "initialized",
    );
  }
  if (
    (await getTenantConfiguration(ctx, "businessHours", organization._id)) ===
    null
  ) {
    await ctx.db.insert("businessHours", {
      organizationId: organization._id,
      configured: false,
      schedule: CLOSED_WEEK,
      createdAt: now,
      updatedAt: now,
    });
    await configurationAudit(
      ctx,
      organization._id,
      actor,
      "business_hours",
      "initialized",
    );
  }
  if (
    (await getTenantConfiguration(ctx, "aiPolicies", organization._id)) === null
  ) {
    await ctx.db.insert("aiPolicies", {
      organizationId: organization._id,
      actions: SAFE_DEFAULT_ACTIONS,
      responseLanguage: "business_default",
      communicationTone: "neutral",
      createdAt: now,
      updatedAt: now,
    });
    await configurationAudit(
      ctx,
      organization._id,
      actor,
      "ai_policy",
      "initialized",
    );
  }
}

export function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100)
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizedLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(normalized) ? normalized : null;
}
