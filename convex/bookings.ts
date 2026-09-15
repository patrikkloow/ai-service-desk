import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { findBlockingBooking, validateBookingInterval } from "./availability";
import { requireCurrentTenant } from "./tenant";

const bookingStatus = v.union(
  v.literal("confirmed"),
  v.literal("cancelled"),
  v.literal("completed"),
);

function optionalNotes(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const notes = value.trim();
  if (notes.length === 0) return undefined;
  if (notes.length > 10_000) throw new Error("Notes are too long");
  return notes;
}

async function getAvailableBooking(
  ctx: QueryCtx | MutationCtx,
  bookingId: Id<"bookings">,
) {
  const tenant = await requireCurrentTenant(ctx);
  const booking = await ctx.db.get(bookingId);
  if (booking === null || booking.organizationId !== tenant.organization._id) {
    return null;
  }
  return booking;
}

async function getBookableRecords(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  customerId: Id<"customers">,
  serviceId: Id<"services">,
) {
  const customer = await ctx.db.get(customerId);
  if (customer === null || customer.organizationId !== organizationId) {
    throw new Error("Customer is unavailable");
  }
  const service = await ctx.db.get(serviceId);
  if (service === null || service.organizationId !== organizationId) {
    throw new Error("Service is unavailable");
  }
  if (service.status !== "active") throw new Error("Service is inactive");
  return { customer, service };
}

export const list = query({
  args: { status: v.optional(bookingStatus) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    if (args.status !== undefined) {
      return await ctx.db
        .query("bookings")
        .withIndex("by_organizationId_and_status_and_startTime", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("bookings")
      .withIndex("by_organizationId_and_startTime", (q) =>
        q.eq("organizationId", tenant.organization._id),
      )
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => await getAvailableBooking(ctx, args.bookingId),
});

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    serviceId: v.id("services"),
    startTime: v.number(),
    endTime: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateBookingInterval(args.startTime, args.endTime);
    const tenant = await requireCurrentTenant(ctx);
    const { customer, service } = await getBookableRecords(
      ctx,
      tenant.organization._id,
      args.customerId,
      args.serviceId,
    );
    const blockingBooking = await findBlockingBooking(
      ctx,
      tenant.organization._id,
      args.startTime,
      args.endTime,
    );
    if (blockingBooking !== null) throw new Error("The requested time is unavailable");
    const now = Date.now();
    const notes = optionalNotes(args.notes);
    return await ctx.db.insert("bookings", {
      organizationId: tenant.organization._id,
      customerId: customer._id,
      serviceId: service._id,
      customerName: customer.name,
      serviceName: service.name,
      servicePricing: service.pricing,
      startTime: args.startTime,
      endTime: args.endTime,
      ...(notes !== undefined ? { notes } : {}),
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const reschedule = mutation({
  args: { bookingId: v.id("bookings"), startTime: v.number(), endTime: v.number() },
  handler: async (ctx, args) => {
    validateBookingInterval(args.startTime, args.endTime);
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (booking === null) throw new Error("Booking is unavailable");
    if (booking.status !== "confirmed") throw new Error("Only confirmed bookings can be rescheduled");
    const blockingBooking = await findBlockingBooking(
      ctx, booking.organizationId, args.startTime, args.endTime, booking._id,
    );
    if (blockingBooking !== null) throw new Error("The requested time is unavailable");
    await ctx.db.patch("bookings", booking._id, {
      startTime: args.startTime, endTime: args.endTime, updatedAt: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (booking === null) throw new Error("Booking is unavailable");
    if (booking.status !== "confirmed") throw new Error("Only confirmed bookings can be cancelled");
    await ctx.db.patch("bookings", booking._id, { status: "cancelled", updatedAt: Date.now() });
  },
});

export const complete = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await getAvailableBooking(ctx, args.bookingId);
    if (booking === null) throw new Error("Booking is unavailable");
    if (booking.status !== "confirmed") throw new Error("Only confirmed bookings can be completed");
    await ctx.db.patch("bookings", booking._id, { status: "completed", updatedAt: Date.now() });
  },
});
