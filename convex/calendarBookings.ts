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
const scheduleConfirmationReason = v.union(
  v.literal("business_hours_missing"),
  v.literal("outside_business_hours"),
  v.literal("outside_schedule"),
);
const calendarRejectionReason = v.union(
  v.literal("booking_conflict"),
  v.literal("blocked"),
  v.literal("booking_changed"),
  v.literal("resource_unavailable"),
  v.literal("schedule_missing"),
  v.literal("service_not_supported"),
);
const calendarBookingResult = v.union(
  v.object({
    status: v.literal("needs_confirmation"),
    reason: scheduleConfirmationReason,
  }),
  v.object({
    status: v.literal("rejected"),
    reason: calendarRejectionReason,
  }),
  v.object({
    status: v.literal("saved"),
    bookingId: v.id("bookings"),
    updatedAt: v.number(),
  }),
);

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

async function validateBookingReferencesBeforeConfirmation(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    customer:
      | { kind: "existing"; customerId: Id<"customers"> }
      | { kind: "new" };
    serviceId: Id<"services">;
    serviceRequestId?: Id<"serviceRequests">;
  },
) {
  const service = await ctx.db.get(args.serviceId);
  if (
    !service ||
    service.organizationId !== args.organizationId ||
    service.status !== "active"
  )
    throw new Error("Service is unavailable");
  if (!service.durationMinutes || service.durationMinutes < 1)
    throw new Error("Service duration must be configured");
  const customer =
    args.customer.kind === "existing"
      ? await ctx.db.get(args.customer.customerId)
      : null;
  if (
    args.customer.kind === "existing" &&
    (!customer ||
      customer.organizationId !== args.organizationId ||
      customer.status !== "active")
  )
    throw new Error("Customer is unavailable");
  if (!args.serviceRequestId) return;
  const request = await ctx.db.get(args.serviceRequestId);
  if (!request || request.organizationId !== args.organizationId)
    throw new Error("Service request is unavailable");
  if (request.bookingId)
    throw new Error("Service request already has a booking");
  if (
    request.customerId &&
    (args.customer.kind !== "existing" ||
      request.customerId !== args.customer.customerId)
  )
    throw new Error("Booking customer must match request");
  if (request.serviceId && request.serviceId !== args.serviceId)
    throw new Error("Booking service must match request");
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
    allowScheduleOverride?: boolean;
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
    ...(args.allowScheduleOverride ? { allowScheduleOverride: true } : {}),
  });
  if (request) {
    const now = Date.now();
    await ctx.db.patch(bookingId, {
      serviceRequestId: request._id,
      updatedAt: now,
    });
    await ctx.db.patch(request._id, {
      bookingId,
      serviceId: service._id,
      serviceName: service.name,
      servicePricing: service.pricing,
      updatedAt: now,
    });
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
    const allServiceLinks = await ctx.db
      .query("serviceResources")
      .withIndex("by_organizationId_and_resourceId", (q) =>
        q.eq("organizationId", tenant.organization._id),
      )
      .collect();
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
        Promise.resolve(
          allServiceLinks.filter((link) => link.resourceId === resource._id),
        ),
      ]);
      const legacyAllowedServiceIds = services
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
      calendarResources.push({
        ...resource,
        scheduleConfigured: schedule?.configured ?? false,
        serviceIds,
        serviceRestrictionMode:
          resource.serviceRestrictionMode ??
          (serviceIds.length === services.length ? "all" : "selected"),
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
    includeCancelled: v.optional(v.boolean()),
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
        (args.includeCancelled || booking.status !== "cancelled") &&
        (!args.resourceId ||
          booking.resourceId === undefined ||
          booking.resourceId === args.resourceId),
    );
  },
});

export const detail = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (!booking) return null;
    const [customer, request] = await Promise.all([
      ctx.db.get(booking.customerId),
      booking.serviceRequestId ? ctx.db.get(booking.serviceRequestId) : null,
    ]);
    if (!customer || customer.organizationId !== booking.organizationId)
      throw new Error("Customer is unavailable");
    if (request && request.organizationId !== booking.organizationId)
      throw new Error("Service request is unavailable");
    return {
      booking,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      request: request
        ? { _id: request._id, title: request.title, summary: request.summary }
        : null,
    };
  },
});

const scheduleReasons = new Set([
  "business_hours_missing",
  "outside_business_hours",
  "outside_schedule",
]);

type CalendarRejectionReason =
  | "booking_conflict"
  | "blocked"
  | "booking_changed"
  | "resource_unavailable"
  | "schedule_missing"
  | "service_not_supported";

function rejectionReason(reason: string): CalendarRejectionReason {
  if (reason === "booking_conflict") return reason;
  if (reason === "blocked") return reason;
  if (reason === "resource_unavailable") return reason;
  if (reason === "schedule_missing") return reason;
  if (reason === "service_not_supported") return reason;
  throw new Error("Calendar rejection reason is invalid");
}

function confirmationReason(
  reason: string,
): "business_hours_missing" | "outside_business_hours" | "outside_schedule" {
  if (reason === "business_hours_missing") return reason;
  if (reason === "outside_business_hours") return reason;
  if (reason === "outside_schedule") return reason;
  throw new Error("Schedule confirmation reason is invalid");
}

async function savedBookingResult(ctx: MutationCtx, bookingId: Id<"bookings">) {
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new Error("Booking is unavailable");
  return { status: "saved" as const, bookingId, updatedAt: booking.updatedAt };
}

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
    confirmScheduleOverride: v.optional(v.boolean()),
  },
  returns: calendarBookingResult,
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
      return await savedBookingResult(ctx, existing.bookingId);
    }
    await validateBookingReferencesBeforeConfirmation(ctx, {
      organizationId: tenant.organization._id,
      customer,
      serviceId: args.serviceId,
      serviceRequestId: args.serviceRequestId,
    });
    const strictAvailability = await findAvailableResource(ctx, {
      organizationId: tenant.organization._id,
      serviceId: args.serviceId,
      resourceId: args.resourceId,
      startTime: args.startTime,
      endTime: args.endTime,
    });
    const overrideRequired =
      !strictAvailability.available &&
      scheduleReasons.has(strictAvailability.reason);
    if (overrideRequired && !args.confirmScheduleOverride)
      return {
        status: "needs_confirmation" as const,
        reason: confirmationReason(strictAvailability.reason),
      };
    if (!strictAvailability.available && !overrideRequired)
      return {
        status: "rejected" as const,
        reason: rejectionReason(strictAvailability.reason),
      };
    if (overrideRequired) {
      const overriddenAvailability = await findAvailableResource(ctx, {
        organizationId: tenant.organization._id,
        serviceId: args.serviceId,
        resourceId: args.resourceId,
        startTime: args.startTime,
        endTime: args.endTime,
        allowScheduleOverride: true,
      });
      if (!overriddenAvailability.available)
        return {
          status: "rejected" as const,
          reason: rejectionReason(overriddenAvailability.reason),
        };
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
      ...(overrideRequired ? { allowScheduleOverride: true } : {}),
    });
    await ctx.db.insert("bookingCreateAttempts", {
      organizationId: tenant.organization._id,
      key,
      fingerprint,
      bookingId,
      createdAt: Date.now(),
    });
    if (overrideRequired) {
      await ctx.db.insert("bookingEvents", {
        organizationId: tenant.organization._id,
        bookingId,
        resourceId: args.resourceId,
        action: "schedule_override_created",
        actor: tenant.identity.tokenIdentifier,
        createdAt: Date.now(),
      });
    }
    return await savedBookingResult(ctx, bookingId);
  },
});

export const reschedule = mutation({
  args: {
    bookingId: v.id("bookings"),
    resourceId: v.id("resources"),
    startTime: v.number(),
    endTime: v.number(),
    expectedUpdatedAt: v.number(),
    confirmScheduleOverride: v.optional(v.boolean()),
  },
  returns: calendarBookingResult,
  handler: async (ctx, args) => {
    validateBookingInterval(args.startTime, args.endTime);
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (!booking || booking.status !== "confirmed")
      throw new Error("Booking is unavailable");
    if (booking.updatedAt !== args.expectedUpdatedAt)
      return { status: "rejected" as const, reason: "booking_changed" as const };
    const strictAvailability = await findAvailableResource(ctx, {
      organizationId: booking.organizationId,
      serviceId: booking.serviceId,
      resourceId: args.resourceId,
      startTime: args.startTime,
      endTime: args.endTime,
      excludeBookingId: booking._id,
    });
    const overrideRequired =
      !strictAvailability.available &&
      scheduleReasons.has(strictAvailability.reason);
    if (overrideRequired && !args.confirmScheduleOverride)
      return {
        status: "needs_confirmation" as const,
        reason: confirmationReason(strictAvailability.reason),
      };
    if (!strictAvailability.available && !overrideRequired)
      return {
        status: "rejected" as const,
        reason: rejectionReason(strictAvailability.reason),
      };
    if (overrideRequired) {
      const overriddenAvailability = await findAvailableResource(ctx, {
        organizationId: booking.organizationId,
        serviceId: booking.serviceId,
        resourceId: args.resourceId,
        startTime: args.startTime,
        endTime: args.endTime,
        excludeBookingId: booking._id,
        allowScheduleOverride: true,
      });
      if (!overriddenAvailability.available)
        return {
          status: "rejected" as const,
          reason: rejectionReason(overriddenAvailability.reason),
        };
    }
    const bookingId = await rescheduleTenantBooking(ctx, {
      bookingId: booking._id,
      resourceId: args.resourceId,
      startTime: args.startTime,
      endTime: args.endTime,
      ...(overrideRequired ? { allowScheduleOverride: true } : {}),
    });
    if (overrideRequired) {
      const tenant = await requireCurrentTenant(ctx);
      await ctx.db.insert("bookingEvents", {
        organizationId: booking.organizationId,
        bookingId,
        resourceId: args.resourceId,
        action: "schedule_override_rescheduled",
        actor: tenant.identity.tokenIdentifier,
        createdAt: Date.now(),
      });
    }
    return await savedBookingResult(ctx, bookingId);
  },
});

export const position = query({
  args: { bookingId: v.id("bookings") },
  returns: v.union(
    v.null(),
    v.object({
      bookingId: v.id("bookings"),
      resourceId: v.optional(v.id("resources")),
      startTime: v.number(),
      endTime: v.number(),
      status: v.union(
        v.literal("confirmed"),
        v.literal("cancelled"),
        v.literal("completed"),
      ),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const booking = await getAvailableBooking(ctx, args.bookingId);
    return booking
      ? {
          bookingId: booking._id,
          resourceId: booking.resourceId,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          updatedAt: booking.updatedAt,
        }
      : null;
  },
});

export const createAttempt = query({
  args: { idempotencyKey: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      bookingId: v.id("bookings"),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    if (!/^[A-Za-z0-9_-]{16,120}$/.test(args.idempotencyKey))
      throw new Error("Idempotency key is invalid");
    const attempt = await ctx.db
      .query("bookingCreateAttempts")
      .withIndex("by_organizationId_and_key", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("key", args.idempotencyKey),
      )
      .unique();
    if (!attempt) return null;
    const booking = await ctx.db.get(attempt.bookingId);
    if (!booking || booking.organizationId !== tenant.organization._id)
      throw new Error("Booking is unavailable");
    return { bookingId: booking._id, updatedAt: booking.updatedAt };
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
