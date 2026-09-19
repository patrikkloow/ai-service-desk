import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  MAX_BOOKING_DURATION_MS,
  validateBookingInterval,
} from "./availability";
import { findAvailableResource } from "./resourceAvailability";
import {
  createTenantBooking,
  getAvailableBooking,
  rescheduleTenantBooking,
} from "./bookings";
import { requireCurrentTenant } from "./tenant";

const MAX_CALENDAR_RANGE_MS = 45 * 24 * 60 * 60 * 1000;

function validateCalendarRange(startTime: number, endTime: number) {
  if (
    !Number.isSafeInteger(startTime) ||
    !Number.isSafeInteger(endTime) ||
    startTime < 0 ||
    endTime <= startTime
  )
    throw new Error("Calendar range is invalid");
  if (endTime - startTime > MAX_CALENDAR_RANGE_MS)
    throw new Error("Calendar range is too large");
}

function optionalNotes(value: string | undefined) {
  const result = value?.trim();
  if (!result) return undefined;
  if (result.length > 10_000) throw new Error("Notes are too long");
  return result;
}

function requiredCustomerText(value: string, maximum: number) {
  const result = value.trim();
  if (!result || result.length > maximum)
    throw new Error("Customer data is invalid");
  return result;
}

function customerEmail(value: string) {
  const email = requiredCustomerText(value.toLowerCase(), 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Customer email is invalid");
  return email;
}

async function bookableRecords(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  customerId: Id<"customers">,
  serviceId: Id<"services">,
) {
  const customer = await ctx.db.get(customerId);
  const service = await ctx.db.get(serviceId);
  if (
    !customer ||
    customer.organizationId !== organizationId ||
    customer.status !== "active"
  )
    throw new Error("Customer is unavailable");
  if (
    !service ||
    service.organizationId !== organizationId ||
    service.status !== "active"
  )
    throw new Error("Service is unavailable");
  if (!service.durationMinutes || service.durationMinutes < 1)
    throw new Error("Service duration must be configured");
  return { customer, service };
}

async function linkedRequest(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  requestId: Id<"serviceRequests"> | undefined,
  customerId: Id<"customers">,
  serviceId: Id<"services">,
) {
  if (!requestId) return null;
  const request = await ctx.db.get(requestId);
  if (!request || request.organizationId !== organizationId)
    throw new Error("Service request is unavailable");
  if (request.bookingId)
    throw new Error("Service request already has a booking");
  if (request.customerId && request.customerId !== customerId)
    throw new Error("Booking customer must match request");
  if (request.serviceId && request.serviceId !== serviceId)
    throw new Error("Booking service must match request");
  return request;
}

async function createResourceBooking(
  ctx: MutationCtx,
  args: {
    customerId: Id<"customers">;
    serviceId: Id<"services">;
    resourceId?: Id<"resources">;
    serviceRequestId?: Id<"serviceRequests">;
    startTime: number;
    endTime: number;
    notes?: string;
  },
) {
  validateBookingInterval(args.startTime, args.endTime);
  const tenant = await requireCurrentTenant(ctx);
  const { customer, service } = await bookableRecords(
    ctx,
    tenant.organization._id,
    args.customerId,
    args.serviceId,
  );
  const request = await linkedRequest(
    ctx,
    tenant.organization._id,
    args.serviceRequestId,
    customer._id,
    service._id,
  );
  const bookingId = await createTenantBooking(ctx, {
    customerId: customer._id,
    serviceId: service._id,
    resourceId: args.resourceId,
    startTime: args.startTime,
    endTime: args.endTime,
    notes: args.notes,
  });
  if (request) {
    const now = Date.now();
    await ctx.db.patch(bookingId, {
      serviceRequestId: request._id,
      updatedAt: now,
    });
    await ctx.db.patch(request._id, { bookingId, updatedAt: now });
  }
  return bookingId;
}

const bookingCustomer = v.union(
  v.object({ kind: v.literal("existing"), customerId: v.id("customers") }),
  v.object({
    kind: v.literal("new"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  }),
);

export const context = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireCurrentTenant(ctx);
    const [profile, resources, services, customers, requests] =
      await Promise.all([
        ctx.db
          .query("businessProfiles")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", tenant.organization._id),
          )
          .unique(),
        ctx.db
          .query("resources")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", tenant.organization._id),
          )
          .collect(),
        ctx.db
          .query("services")
          .withIndex("by_organizationId_and_status", (q) =>
            q
              .eq("organizationId", tenant.organization._id)
              .eq("status", "active"),
          )
          .collect(),
        ctx.db
          .query("customers")
          .withIndex("by_organizationId_and_status", (q) =>
            q
              .eq("organizationId", tenant.organization._id)
              .eq("status", "active"),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("serviceRequests")
          .withIndex("by_organizationId_and_updatedAt", (q) =>
            q.eq("organizationId", tenant.organization._id),
          )
          .order("desc")
          .take(100),
      ]);
    const calendarResources = [];
    for (const resource of resources) {
      const [schedule, links] = await Promise.all([
        ctx.db
          .query("resourceSchedules")
          .withIndex("by_organizationId_and_resourceId", (q) =>
            q
              .eq("organizationId", tenant.organization._id)
              .eq("resourceId", resource._id),
          )
          .unique(),
        ctx.db
          .query("serviceResources")
          .withIndex("by_organizationId_and_resourceId", (q) =>
            q
              .eq("organizationId", tenant.organization._id)
              .eq("resourceId", resource._id),
          )
          .collect(),
      ]);
      calendarResources.push({
        ...resource,
        scheduleConfigured: schedule?.configured ?? false,
        serviceIds: links.map((link) => link.serviceId),
      });
    }
    const calendarServices = [];
    for (const service of services) {
      const links = await ctx.db
        .query("serviceResources")
        .withIndex("by_organizationId_and_serviceId", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("serviceId", service._id),
        )
        .collect();
      calendarServices.push({
        ...service,
        resourceIds: links.map((link) => link.resourceId),
      });
    }
    return {
      timezone: profile?.timezone ?? "Europe/Stockholm",
      resources: calendarResources,
      services: calendarServices,
      customers,
      requests,
    };
  },
});

export const listRange = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
    resourceId: v.optional(v.id("resources")),
  },
  handler: async (ctx, args) => {
    validateCalendarRange(args.startTime, args.endTime);
    const tenant = await requireCurrentTenant(ctx);
    if (args.resourceId) {
      const resource = await ctx.db.get(args.resourceId);
      if (!resource || resource.organizationId !== tenant.organization._id)
        throw new Error("Resource is unavailable");
    }
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_organizationId_and_startTime", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .gte("startTime", args.startTime - MAX_BOOKING_DURATION_MS)
          .lt("startTime", args.endTime),
      )
      .collect();
    return bookings.filter(
      (booking) =>
        booking.endTime > args.startTime &&
        (!args.resourceId ||
          booking.resourceId === undefined ||
          booking.resourceId === args.resourceId),
    );
  },
});

export const create = mutation({
  args: {
    idempotencyKey: v.string(),
    customer: bookingCustomer,
    serviceId: v.id("services"),
    resourceId: v.id("resources"),
    serviceRequestId: v.optional(v.id("serviceRequests")),
    startTime: v.number(),
    endTime: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const key = args.idempotencyKey.trim();
    if (!/^[A-Za-z0-9_-]{16,120}$/.test(key))
      throw new Error("Idempotency key is invalid");
    const customer =
      args.customer.kind === "existing"
        ? args.customer
        : {
            kind: "new" as const,
            name: requiredCustomerText(args.customer.name, 200),
            ...(args.customer.email?.trim()
              ? {
                  email: customerEmail(args.customer.email),
                }
              : {}),
            ...(args.customer.phone?.trim()
              ? {
                  phone: requiredCustomerText(args.customer.phone, 64),
                }
              : {}),
          };
    const fingerprint = JSON.stringify({
      customer,
      serviceId: args.serviceId,
      resourceId: args.resourceId,
      serviceRequestId: args.serviceRequestId,
      startTime: args.startTime,
      endTime: args.endTime,
      notes: optionalNotes(args.notes),
    });
    const existing = await ctx.db
      .query("bookingCreateAttempts")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", tenant.organization._id).eq("key", key),
      )
      .unique();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error("Idempotency key was already used for another booking");
      return existing.bookingId;
    }
    const customerId =
      customer.kind === "existing"
        ? customer.customerId
        : await ctx.db.insert("customers", {
            organizationId: tenant.organization._id,
            name: customer.name,
            ...(customer.email ? { email: customer.email } : {}),
            ...(customer.phone ? { phone: customer.phone } : {}),
            status: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
    const bookingId = await createResourceBooking(ctx, {
      customerId,
      serviceId: args.serviceId,
      resourceId: args.resourceId,
      serviceRequestId: args.serviceRequestId,
      startTime: args.startTime,
      endTime: args.endTime,
      notes: args.notes,
    });
    await ctx.db.insert("bookingCreateAttempts", {
      organizationId: tenant.organization._id,
      key,
      fingerprint,
      bookingId,
      createdAt: Date.now(),
    });
    return bookingId;
  },
});

export const reschedule = mutation({
  args: {
    bookingId: v.id("bookings"),
    resourceId: v.id("resources"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    validateBookingInterval(args.startTime, args.endTime);
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (!booking || booking.status !== "confirmed")
      throw new Error("Booking is unavailable");
    return await rescheduleTenantBooking(ctx, args);
  },
});

export const assignLegacyResource = mutation({
  args: { bookingId: v.id("bookings"), resourceId: v.id("resources") },
  handler: async (ctx, args) => {
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (!booking || booking.status !== "confirmed" || booking.resourceId)
      throw new Error("Booking is unavailable");
    const available = await findAvailableResource(ctx, {
      organizationId: booking.organizationId,
      serviceId: booking.serviceId,
      resourceId: args.resourceId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      excludeBookingId: booking._id,
    });
    if (!available.available)
      throw new Error(
        `The requested resource is unavailable: ${available.reason}`,
      );
    await ctx.db.patch(booking._id, {
      resourceId: available.resource._id,
      resourceName: available.resource.name,
      updatedAt: Date.now(),
    });
  },
});
