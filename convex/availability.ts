import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireCurrentTenant } from "./tenant";

const MIN_BOOKING_DURATION_MS = 60_000;
export const MAX_BOOKING_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_AVAILABILITY_CANDIDATES = 3_000;

type BookingContext = QueryCtx | MutationCtx;

/**
 * Booking times are absolute Unix milliseconds. A bounded appointment length
 * keeps the tenant-first availability index query finite and exact.
 */
export function validateBookingInterval(startTime: number, endTime: number) {
  if (
    !Number.isSafeInteger(startTime) ||
    !Number.isSafeInteger(endTime) ||
    startTime < 0 ||
    endTime < 0
  ) {
    throw new Error("Booking times must be positive whole Unix milliseconds");
  }

  if (endTime <= startTime) {
    throw new Error("End time must be after start time");
  }

  const duration = endTime - startTime;

  if (duration < MIN_BOOKING_DURATION_MS) {
    throw new Error("Bookings must be at least one minute long");
  }

  if (duration > MAX_BOOKING_DURATION_MS) {
    throw new Error("Bookings cannot be longer than 24 hours");
  }
}

/**
 * Finds a confirmed booking that overlaps the requested half-open interval.
 * Cancelled and completed bookings intentionally do not block availability.
 */
export async function findBlockingBooking(
  ctx: BookingContext,
  organizationId: Id<"organizations">,
  startTime: number,
  endTime: number,
  excludeBookingId?: Id<"bookings">,
) {
  const candidates = await ctx.db
    .query("bookings")
    .withIndex("by_organizationId_and_status_and_startTime", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("status", "confirmed")
        .gte("startTime", startTime - MAX_BOOKING_DURATION_MS)
        .lt("startTime", endTime),
    )
    .take(MAX_AVAILABILITY_CANDIDATES);

  return (
    candidates.find(
      (booking) =>
        booking._id !== excludeBookingId && booking.endTime > startTime,
    ) ?? null
  );
}

export const check = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    validateBookingInterval(args.startTime, args.endTime);
    const tenant = await requireCurrentTenant(ctx);
    const blockingBooking = await findBlockingBooking(
      ctx,
      tenant.organization._id,
      args.startTime,
      args.endTime,
    );

    return { available: blockingBooking === null };
  },
});
