import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { resourceKind, resourceStatus } from "./bookingValidators";
import { weeklyBusinessHours } from "./configValidators";
import { CLOSED_WEEK, getTenantConfiguration } from "./configuration";
import { validateWeeklySchedule } from "./businessHours";
import { validateBookingInterval } from "./availability";
import { findBlockingResourceBooking } from "./resourceAvailability";
import { requireCurrentTenant, requireCurrentTenantAdmin } from "./tenant";

const MAX_RESOURCE_NAME = 160;
const MAX_BLOCK_NOTE = 1_000;
const MAX_BLOCK_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const serviceRestrictionMode = v.union(
  v.literal("all"),
  v.literal("selected"),
);

function validateBlockListRange(startTime: number, endTime: number) {
  if (
    !Number.isSafeInteger(startTime) ||
    !Number.isSafeInteger(endTime) ||
    startTime < 0 ||
    endTime <= startTime
  )
    throw new Error("Blocked-time range is invalid");
  if (endTime - startTime > MAX_BLOCK_RANGE_MS)
    throw new Error("Blocked-time range is too large");
}

function requiredName(value: string) {
  const result = value.trim();
  if (!result || result.length > MAX_RESOURCE_NAME)
    throw new Error("Resource name is invalid");
  return result;
}

function optionalNote(value: string | undefined) {
  const result = value?.trim();
  if (!result) return undefined;
  if (result.length > MAX_BLOCK_NOTE)
    throw new Error("Blocked-time note is too long");
  return result;
}

async function ownedResource(
  ctx: QueryCtx | MutationCtx,
  resourceId: Id<"resources">,
  organizationId: Id<"organizations">,
) {
  const resource = await ctx.db.get(resourceId);
  if (!resource || resource.organizationId !== organizationId)
    throw new Error("Resource is unavailable");
  return resource;
}

async function auditResource(
  ctx: MutationCtx,
  tenant: Awaited<ReturnType<typeof requireCurrentTenantAdmin>>,
  resourceId: Id<"resources">,
  action: Doc<"resourceEvents">["action"],
) {
  await ctx.db.insert("resourceEvents", {
    organizationId: tenant.organization._id,
    resourceId,
    action,
    actor: tenant.identity.tokenIdentifier,
    createdAt: Date.now(),
  });
}

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const profile = await getTenantConfiguration(
      ctx,
      "businessProfiles",
      tenant.organization._id,
    );
    const resources = args.includeInactive
      ? await ctx.db
          .query("resources")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", tenant.organization._id),
          )
          .collect()
      : await ctx.db
          .query("resources")
          .withIndex("by_organizationId_and_status", (q) =>
            q
              .eq("organizationId", tenant.organization._id)
              .eq("status", "active"),
          )
          .collect();
    const [tenantServices, allServiceLinks] = await Promise.all([
      ctx.db
        .query("services")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", tenant.organization._id),
        )
        .collect(),
      ctx.db
        .query("serviceResources")
        .withIndex("by_organizationId_and_resourceId", (q) =>
          q.eq("organizationId", tenant.organization._id),
        )
        .collect(),
    ]);
    const result = [];
    for (const resource of resources) {
      const schedule = await ctx.db
        .query("resourceSchedules")
        .withIndex("by_organizationId_and_resourceId", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("resourceId", resource._id),
        )
        .unique();
      const links = allServiceLinks.filter(
        (link) => link.resourceId === resource._id,
      );
      const legacyAllowedServiceIds = tenantServices
        .filter((service) => {
          const serviceLinks = allServiceLinks.filter(
            (link) => link.serviceId === service._id,
          );
          return (
            serviceLinks.length === 0 ||
            serviceLinks.some((link) => link.resourceId === resource._id)
          );
        })
        .map((service) => service._id);
      const serviceIds = resource.serviceRestrictionMode
        ? links.map((link) => link.serviceId)
        : legacyAllowedServiceIds;
      result.push({
        ...resource,
        schedule,
        serviceIds,
        serviceRestrictionMode:
          resource.serviceRestrictionMode ??
          (serviceIds.length === tenantServices.length ? "all" : "selected"),
      });
    }
    return {
      resources: result,
      timezone: profile?.timezone ?? "Europe/Stockholm",
      canEdit: tenant.role === "org:admin",
    };
  },
});

export const create = mutation({
  args: { name: v.string(), kind: resourceKind },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const now = Date.now();
    const resourceId = await ctx.db.insert("resources", {
      organizationId: tenant.organization._id,
      name: requiredName(args.name),
      kind: args.kind,
      status: "active",
      serviceRestrictionMode: "all",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("resourceSchedules", {
      organizationId: tenant.organization._id,
      resourceId,
      configured: false,
      schedule: CLOSED_WEEK,
      createdAt: now,
      updatedAt: now,
    });
    await auditResource(ctx, tenant, resourceId, "created");
    return resourceId;
  },
});

export const update = mutation({
  args: {
    resourceId: v.id("resources"),
    name: v.optional(v.string()),
    kind: v.optional(resourceKind),
    status: v.optional(resourceStatus),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const resource = await ownedResource(
      ctx,
      args.resourceId,
      tenant.organization._id,
    );
    await ctx.db.patch(resource._id, {
      ...(args.name === undefined ? {} : { name: requiredName(args.name) }),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.status === undefined ? {} : { status: args.status }),
      updatedAt: Date.now(),
    });
    await auditResource(ctx, tenant, resource._id, "updated");
  },
});

export const updateSchedule = mutation({
  args: { resourceId: v.id("resources"), schedule: weeklyBusinessHours },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const resource = await ownedResource(
      ctx,
      args.resourceId,
      tenant.organization._id,
    );
    const current = await ctx.db
      .query("resourceSchedules")
      .withIndex("by_organizationId_and_resourceId", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("resourceId", resource._id),
      )
      .unique();
    const now = Date.now();
    const schedule = validateWeeklySchedule(args.schedule);
    if (current) {
      await ctx.db.replace(current._id, {
        organizationId: tenant.organization._id,
        resourceId: resource._id,
        configured: true,
        schedule,
        createdAt: current.createdAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("resourceSchedules", {
        organizationId: tenant.organization._id,
        resourceId: resource._id,
        configured: true,
        schedule,
        createdAt: now,
        updatedAt: now,
      });
    }
    await auditResource(ctx, tenant, resource._id, "schedule_updated");
  },
});

export const copyBusinessHours = mutation({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const resource = await ownedResource(
      ctx,
      args.resourceId,
      tenant.organization._id,
    );
    const businessHours = await getTenantConfiguration(
      ctx,
      "businessHours",
      tenant.organization._id,
    );
    if (!businessHours?.configured)
      throw new Error("Business hours must be configured before copying");
    const current = await ctx.db
      .query("resourceSchedules")
      .withIndex("by_organizationId_and_resourceId", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("resourceId", resource._id),
      )
      .unique();
    const now = Date.now();
    const value = {
      organizationId: tenant.organization._id,
      resourceId: resource._id,
      configured: true,
      schedule: businessHours.schedule,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (current) await ctx.db.replace(current._id, value);
    else await ctx.db.insert("resourceSchedules", value);
    await auditResource(ctx, tenant, resource._id, "schedule_updated");
  },
});

export const setServices = mutation({
  args: {
    resourceId: v.id("resources"),
    serviceIds: v.array(v.id("services")),
    serviceRestrictionMode: v.optional(serviceRestrictionMode),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const resource = await ownedResource(
      ctx,
      args.resourceId,
      tenant.organization._id,
    );
    const unique = [...new Set(args.serviceIds)];
    if (unique.length !== args.serviceIds.length || unique.length > 100)
      throw new Error("Resource services are invalid");
    for (const serviceId of unique) {
      const service = await ctx.db.get(serviceId);
      if (!service || service.organizationId !== tenant.organization._id)
        throw new Error("Service is unavailable");
    }
    const mode =
      args.serviceRestrictionMode ??
      (unique.length > 0 ? "selected" : "all");
    if (mode === "all" && unique.length > 0)
      throw new Error("An unrestricted resource cannot have service links");
    const existing = await ctx.db
      .query("serviceResources")
      .withIndex("by_organizationId_and_resourceId", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("resourceId", resource._id),
      )
      .collect();
    for (const link of existing) await ctx.db.delete(link._id);
    for (const serviceId of unique) {
      await ctx.db.insert("serviceResources", {
        organizationId: tenant.organization._id,
        resourceId: resource._id,
        serviceId,
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch(resource._id, {
      serviceRestrictionMode: mode,
      updatedAt: Date.now(),
    });
    await auditResource(ctx, tenant, resource._id, "updated");
  },
});

export const listBlocks = query({
  args: {
    resourceId: v.id("resources"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    validateBlockListRange(args.startTime, args.endTime);
    const tenant = await requireCurrentTenant(ctx);
    await ownedResource(ctx, args.resourceId, tenant.organization._id);
    return await ctx.db
      .query("resourceBlocks")
      .withIndex("by_organizationId_and_resourceId_and_startTime", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("resourceId", args.resourceId)
          .lt("startTime", args.endTime),
      )
      .filter((q) => q.gt(q.field("endTime"), args.startTime))
      .collect();
  },
});

export const createBlock = mutation({
  args: {
    resourceId: v.id("resources"),
    startTime: v.number(),
    endTime: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateBookingInterval(args.startTime, args.endTime);
    const tenant = await requireCurrentTenantAdmin(ctx);
    const resource = await ownedResource(
      ctx,
      args.resourceId,
      tenant.organization._id,
    );
    const booking = await findBlockingResourceBooking(
      ctx,
      tenant.organization._id,
      args.startTime,
      args.endTime,
      resource._id,
    );
    if (booking) throw new Error("Blocked time overlaps a booking");
    const otherBlock = await ctx.db
      .query("resourceBlocks")
      .withIndex("by_organizationId_and_resourceId_and_startTime", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("resourceId", resource._id)
          .lt("startTime", args.endTime),
      )
      .filter((q) => q.gt(q.field("endTime"), args.startTime))
      .first();
    if (otherBlock) throw new Error("Blocked times cannot overlap");
    const note = optionalNote(args.note);
    const blockId = await ctx.db.insert("resourceBlocks", {
      organizationId: tenant.organization._id,
      resourceId: resource._id,
      startTime: args.startTime,
      endTime: args.endTime,
      ...(note ? { note } : {}),
      createdAt: Date.now(),
    });
    await auditResource(ctx, tenant, resource._id, "block_created");
    return blockId;
  },
});

export const removeBlock = mutation({
  args: { blockId: v.id("resourceBlocks") },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const block = await ctx.db.get(args.blockId);
    if (!block || block.organizationId !== tenant.organization._id)
      throw new Error("Blocked time is unavailable");
    await ctx.db.delete(block._id);
    await auditResource(ctx, tenant, block.resourceId, "block_removed");
  },
});
