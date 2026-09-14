import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCurrentTenant } from "./tenant";

const serviceStatus = v.union(v.literal("active"), v.literal("inactive"));
const pricing = v.union(
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
);

type Pricing =
  | { kind: "not_specified" }
  | { kind: "fixed" | "from"; amountMinor: number; currency: string };

function requiredText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${field} is required`);
  }

  if (normalized.length > maximumLength) {
    throw new Error(`${field} is too long`);
  }

  return normalized;
}

function optionalText(
  value: string | null | undefined,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > maximumLength) {
    throw new Error(`${field} is too long`);
  }

  return normalized;
}

function durationMinutes(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Duration must be a non-negative whole number");
  }

  return value;
}

function normalizedPricing(value: Pricing): Pricing {
  if (value.kind === "not_specified") {
    return value;
  }

  if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0) {
    throw new Error("Price must be a non-negative whole number of minor units");
  }

  const currency = value.currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a three-letter code");
  }

  return { ...value, currency };
}

async function getAvailableService(
  ctx: QueryCtx | MutationCtx,
  serviceId: Id<"services">,
) {
  const tenant = await requireCurrentTenant(ctx);
  const service = await ctx.db.get(serviceId);

  if (service === null || service.organizationId !== tenant.organization._id) {
    return null;
  }

  return service;
}

export const list = query({
  args: { status: v.optional(serviceStatus) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);

    if (args.status !== undefined) {
      return await ctx.db
        .query("services")
        .withIndex("by_organizationId_and_status", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(100);
    }

    return await ctx.db
      .query("services")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", tenant.organization._id),
      )
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    return await getAvailableService(ctx, args.serviceId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    pricing: v.optional(pricing),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const now = Date.now();
    const description = optionalText(args.description, "Description", 10_000);
    const duration = durationMinutes(args.durationMinutes);

    return await ctx.db.insert("services", {
      organizationId: tenant.organization._id,
      name: requiredText(args.name, "Name", 200),
      ...(description !== undefined ? { description } : {}),
      ...(duration !== undefined ? { durationMinutes: duration } : {}),
      pricing: normalizedPricing(args.pricing ?? { kind: "not_specified" }),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    serviceId: v.id("services"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    durationMinutes: v.optional(v.union(v.number(), v.null())),
    pricing: v.optional(pricing),
  },
  handler: async (ctx, args) => {
    const service = await getAvailableService(ctx, args.serviceId);

    if (service === null) {
      throw new Error("Service is unavailable");
    }

    if (
      args.name === undefined &&
      args.description === undefined &&
      args.durationMinutes === undefined &&
      args.pricing === undefined
    ) {
      throw new Error("No service changes supplied");
    }

    const description =
      args.description === undefined
        ? service.description
        : optionalText(args.description, "Description", 10_000);
    const duration =
      args.durationMinutes === undefined
        ? service.durationMinutes
        : durationMinutes(args.durationMinutes);

    await ctx.db.replace("services", service._id, {
      organizationId: service.organizationId,
      name:
        args.name === undefined
          ? service.name
          : requiredText(args.name, "Name", 200),
      ...(description !== undefined ? { description } : {}),
      ...(duration !== undefined ? { durationMinutes: duration } : {}),
      pricing:
        args.pricing === undefined
          ? service.pricing
          : normalizedPricing(args.pricing),
      status: service.status,
      createdAt: service.createdAt,
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    serviceId: v.id("services"),
    status: serviceStatus,
  },
  handler: async (ctx, args) => {
    const service = await getAvailableService(ctx, args.serviceId);

    if (service === null) {
      throw new Error("Service is unavailable");
    }

    await ctx.db.patch("services", service._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
