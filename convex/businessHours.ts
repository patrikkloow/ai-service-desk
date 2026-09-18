import { mutation, query } from "./_generated/server";
import { weeklyBusinessHours } from "./configValidators";
import {
  auditConfigurationUpdate,
  getTenantConfiguration,
} from "./configuration";
import { requireCurrentTenant, requireCurrentTenantAdmin } from "./tenant";

const days = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type WeeklySchedule = Record<
  (typeof days)[number],
  Array<{ start: string; end: string }>
>;

function minute(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error("Business-hour time must use HH:mm");
  const [hour, minutes] = value.split(":").map(Number);
  return hour * 60 + minutes;
}

export function validateWeeklySchedule(schedule: WeeklySchedule) {
  const normalized = {} as WeeklySchedule;
  for (const day of days) {
    if (schedule[day].length > 4)
      throw new Error("Too many intervals in one day");
    const intervals = schedule[day].map((interval) => ({
      ...interval,
      startMinute: minute(interval.start),
      endMinute: minute(interval.end),
    }));
    for (const interval of intervals)
      if (interval.endMinute <= interval.startMinute)
        throw new Error("Business-hour interval must end after it starts");
    intervals.sort((a, b) => a.startMinute - b.startMinute);
    for (let index = 1; index < intervals.length; index += 1)
      if (intervals[index]!.startMinute < intervals[index - 1]!.endMinute)
        throw new Error("Business-hour intervals must not overlap");
    normalized[day] = intervals.map(({ start, end }) => ({ start, end }));
  }
  return normalized;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireCurrentTenant(ctx);
    const hours = await getTenantConfiguration(
      ctx,
      "businessHours",
      tenant.organization._id,
    );
    const profile = await getTenantConfiguration(
      ctx,
      "businessProfiles",
      tenant.organization._id,
    );
    return {
      hours,
      timezone: profile?.timezone ?? null,
      canEdit: tenant.role === "org:admin",
    };
  },
});

export const update = mutation({
  args: { schedule: weeklyBusinessHours },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenantAdmin(ctx);
    const current = await getTenantConfiguration(
      ctx,
      "businessHours",
      tenant.organization._id,
    );
    const profile = await getTenantConfiguration(
      ctx,
      "businessProfiles",
      tenant.organization._id,
    );
    if (current === null || profile === null)
      throw new Error("Business hours are unavailable");
    await ctx.db.replace("businessHours", current._id, {
      organizationId: current.organizationId,
      configured: true,
      schedule: validateWeeklySchedule(args.schedule),
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    await auditConfigurationUpdate(
      ctx,
      tenant.organization._id,
      tenant.identity.tokenIdentifier,
      "business_hours",
    );
  },
});
