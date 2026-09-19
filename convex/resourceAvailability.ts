import { Temporal } from "temporal-polyfill";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  MAX_BOOKING_DURATION_MS,
  validateBookingInterval,
} from "./availability";

type BookingContext = QueryCtx | MutationCtx;

/** Legacy confirmed bookings without a resource block every resource. */
export async function findBlockingResourceBooking(
  ctx: BookingContext,
  organizationId: Id<"organizations">,
  startTime: number,
  endTime: number,
  resourceId: Id<"resources">,
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
    .collect();
  return (
    candidates.find(
      (booking) =>
        booking._id !== excludeBookingId &&
        booking.endTime > startTime &&
        (booking.resourceId === undefined || booking.resourceId === resourceId),
    ) ?? null
  );
}

async function findBlockingResourceTime(
  ctx: BookingContext,
  organizationId: Id<"organizations">,
  resourceId: Id<"resources">,
  startTime: number,
  endTime: number,
) {
  return await ctx.db
    .query("resourceBlocks")
    .withIndex("by_organizationId_and_resourceId_and_startTime", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("resourceId", resourceId)
        .gte("startTime", startTime - MAX_BOOKING_DURATION_MS)
        .lt("startTime", endTime),
    )
    .filter((q) => q.gt(q.field("endTime"), startTime))
    .first();
}

const dayKeys = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function isCoveredBySchedule(
  schedule: Doc<"resourceSchedules">["schedule"],
  timezone: string,
  startTime: number,
  endTime: number,
) {
  const start =
    Temporal.Instant.fromEpochMilliseconds(startTime).toZonedDateTimeISO(
      timezone,
    );
  const end =
    Temporal.Instant.fromEpochMilliseconds(endTime).toZonedDateTimeISO(
      timezone,
    );
  if (!start.toPlainDate().equals(end.toPlainDate())) return false;
  const startMinute =
    start.hour * 60 +
    start.minute +
    start.second / 60 +
    start.millisecond / 60_000;
  const endMinute =
    end.hour * 60 + end.minute + end.second / 60 + end.millisecond / 60_000;
  return schedule[dayKeys[start.dayOfWeek - 1]!].some((interval) => {
    const [startHour, startMinutes] = interval.start.split(":").map(Number);
    const [endHour, endMinutes] = interval.end.split(":").map(Number);
    return (
      startMinute >= startHour * 60 + startMinutes &&
      endMinute <= endHour * 60 + endMinutes
    );
  });
}

async function businessTimezone(
  ctx: BookingContext,
  organizationId: Id<"organizations">,
) {
  const profile = await ctx.db
    .query("businessProfiles")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  if (!profile) throw new Error("Business profile is unavailable");
  return profile.timezone;
}

async function serviceAllowsResource(
  ctx: BookingContext,
  organizationId: Id<"organizations">,
  serviceId: Id<"services">,
  resourceId: Id<"resources">,
) {
  const links = await ctx.db
    .query("serviceResources")
    .withIndex("by_organizationId_and_serviceId", (q) =>
      q.eq("organizationId", organizationId).eq("serviceId", serviceId),
    )
    .collect();
  return (
    links.length === 0 || links.some((link) => link.resourceId === resourceId)
  );
}

export async function resourceAvailability(
  ctx: BookingContext,
  args: {
    organizationId: Id<"organizations">;
    resourceId: Id<"resources">;
    serviceId?: Id<"services">;
    startTime: number;
    endTime: number;
    excludeBookingId?: Id<"bookings">;
  },
) {
  validateBookingInterval(args.startTime, args.endTime);
  const resource = await ctx.db.get(args.resourceId);
  if (
    !resource ||
    resource.organizationId !== args.organizationId ||
    resource.status !== "active"
  )
    return {
      available: false as const,
      reason: "resource_unavailable" as const,
    };
  if (
    args.serviceId &&
    !(await serviceAllowsResource(
      ctx,
      args.organizationId,
      args.serviceId,
      args.resourceId,
    ))
  )
    return {
      available: false as const,
      reason: "service_not_supported" as const,
    };
  const schedule = await ctx.db
    .query("resourceSchedules")
    .withIndex("by_organizationId_and_resourceId", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("resourceId", args.resourceId),
    )
    .unique();
  if (!schedule?.configured)
    return { available: false as const, reason: "schedule_missing" as const };
  if (
    !isCoveredBySchedule(
      schedule.schedule,
      await businessTimezone(ctx, args.organizationId),
      args.startTime,
      args.endTime,
    )
  )
    return { available: false as const, reason: "outside_schedule" as const };
  if (
    await findBlockingResourceTime(
      ctx,
      args.organizationId,
      args.resourceId,
      args.startTime,
      args.endTime,
    )
  )
    return { available: false as const, reason: "blocked" as const };
  if (
    await findBlockingResourceBooking(
      ctx,
      args.organizationId,
      args.startTime,
      args.endTime,
      args.resourceId,
      args.excludeBookingId,
    )
  )
    return {
      available: false as const,
      reason: "booking_conflict" as const,
    };
  return { available: true as const, resource };
}

export async function findAvailableResource(
  ctx: BookingContext,
  args: {
    organizationId: Id<"organizations">;
    serviceId?: Id<"services">;
    startTime: number;
    endTime: number;
    resourceId?: Id<"resources">;
    excludeBookingId?: Id<"bookings">;
  },
) {
  const resources = args.resourceId
    ? [await ctx.db.get(args.resourceId)].filter(
        (resource): resource is Doc<"resources"> => resource !== null,
      )
    : await ctx.db
        .query("resources")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "active"),
        )
        .collect();
  resources.sort(
    (left, right) =>
      left.name.localeCompare(right.name, "sv") ||
      left._id.localeCompare(right._id),
  );
  let firstReason: string | undefined;
  for (const resource of resources) {
    const result = await resourceAvailability(ctx, {
      ...args,
      resourceId: resource._id,
    });
    if (result.available) return result;
    firstReason ??= result.reason;
  }
  return {
    available: false as const,
    reason: firstReason ?? "resource_unavailable",
  };
}
