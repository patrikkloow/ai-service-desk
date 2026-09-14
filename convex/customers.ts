import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCurrentTenant } from "./tenant";

const customerStatus = v.union(v.literal("active"), v.literal("inactive"));

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

function optionalEmail(value: string | null | undefined): string | undefined {
  const email = optionalText(value, "Email", 320);

  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email is invalid");
  }

  return email?.toLowerCase();
}

async function getAvailableCustomer(
  ctx: QueryCtx | MutationCtx,
  customerId: Id<"customers">,
) {
  const tenant = await requireCurrentTenant(ctx);
  const customer = await ctx.db.get(customerId);

  if (customer === null || customer.organizationId !== tenant.organization._id) {
    return null;
  }

  return customer;
}

export const list = query({
  args: { status: v.optional(customerStatus) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);

    if (args.status !== undefined) {
      return await ctx.db
        .query("customers")
        .withIndex("by_organizationId_and_status", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(100);
    }

    return await ctx.db
      .query("customers")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", tenant.organization._id),
      )
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await getAvailableCustomer(ctx, args.customerId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const now = Date.now();
    const email = optionalEmail(args.email);
    const phone = optionalText(args.phone, "Phone", 64);
    const notes = optionalText(args.notes, "Notes", 10_000);

    return await ctx.db.insert("customers", {
      organizationId: tenant.organization._id,
      name: requiredText(args.name, "Name", 200),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(notes !== undefined ? { notes } : {}),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    customerId: v.id("customers"),
    name: v.optional(v.string()),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const customer = await getAvailableCustomer(ctx, args.customerId);

    if (customer === null) {
      throw new Error("Customer is unavailable");
    }

    if (
      args.name === undefined &&
      args.email === undefined &&
      args.phone === undefined &&
      args.notes === undefined
    ) {
      throw new Error("No customer changes supplied");
    }

    const email =
      args.email === undefined ? customer.email : optionalEmail(args.email);
    const phone =
      args.phone === undefined
        ? customer.phone
        : optionalText(args.phone, "Phone", 64);
    const notes =
      args.notes === undefined
        ? customer.notes
        : optionalText(args.notes, "Notes", 10_000);

    await ctx.db.replace("customers", customer._id, {
      organizationId: customer.organizationId,
      name:
        args.name === undefined
          ? customer.name
          : requiredText(args.name, "Name", 200),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(notes !== undefined ? { notes } : {}),
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    customerId: v.id("customers"),
    status: customerStatus,
  },
  handler: async (ctx, args) => {
    const customer = await getAvailableCustomer(ctx, args.customerId);

    if (customer === null) {
      throw new Error("Customer is unavailable");
    }

    await ctx.db.patch("customers", customer._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
