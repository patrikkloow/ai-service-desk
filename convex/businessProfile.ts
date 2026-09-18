import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  auditConfigurationUpdate,
  getTenantConfiguration,
  normalizedLanguage,
  validTimezone,
} from "./configuration";
import { requireCurrentTenant, requireCurrentTenantAdmin } from "./tenant";

function optionalText(value: string | null | undefined, maximum: number) {
  if (value === null || value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maximum) throw new Error("Text is too long");
  return normalized;
}

function requiredText(value: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new Error("Text is invalid");
  return normalized;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireCurrentTenant(ctx);
    const profile = await getTenantConfiguration(
      ctx,
      "businessProfiles",
      tenant.organization._id,
    );
    return { profile, canEdit: tenant.role === "org:admin" };
  },
});

export const update = mutation({
  args: {
    companyName: v.string(),
    timezone: v.string(),
    defaultLanguage: v.string(),
    phone: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    website: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.string(), v.null())),
    businessDescription: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const current = await getTenantConfiguration(
      ctx,
      "businessProfiles",
      tenant.organization._id,
    );
    if (current === null) throw new Error("Business profile is unavailable");
    if (!validTimezone(args.timezone)) throw new Error("Timezone is invalid");
    const defaultLanguage = normalizedLanguage(args.defaultLanguage);
    if (defaultLanguage === null) throw new Error("Language is invalid");
    const email = optionalText(args.email, 320);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Email is invalid");
    const website = optionalText(args.website, 500);
    if (website) {
      let parsed: URL;
      try {
        parsed = new URL(website);
      } catch {
        throw new Error("Website is invalid");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error("Website is invalid");
    }
    await ctx.db.replace("businessProfiles", current._id, {
      organizationId: current.organizationId,
      configured: true,
      companyName: requiredText(args.companyName, 200),
      timezone: args.timezone,
      defaultLanguage,
      ...(optionalText(args.phone, 64)
        ? { phone: optionalText(args.phone, 64) }
        : {}),
      ...(email ? { email } : {}),
      ...(website ? { website } : {}),
      ...(optionalText(args.address, 1000)
        ? { address: optionalText(args.address, 1000) }
        : {}),
      ...(optionalText(args.businessDescription, 4000)
        ? { businessDescription: optionalText(args.businessDescription, 4000) }
        : {}),
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    await auditConfigurationUpdate(
      ctx,
      tenant.organization._id,
      tenant.identity.tokenIdentifier,
      "business_profile",
    );
  },
});
