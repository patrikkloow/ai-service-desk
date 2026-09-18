import { v } from "convex/values";

export const timeInterval = v.object({
  start: v.string(),
  end: v.string(),
});

export const weeklyBusinessHours = v.object({
  monday: v.array(timeInterval),
  tuesday: v.array(timeInterval),
  wednesday: v.array(timeInterval),
  thursday: v.array(timeInterval),
  friday: v.array(timeInterval),
  saturday: v.array(timeInterval),
  sunday: v.array(timeInterval),
});

export const actionPolicy = v.union(
  v.literal("allow"),
  v.literal("confirm"),
  v.literal("human"),
);

export const aiActionPolicies = v.object({
  bookingCreate: actionPolicy,
  bookingReschedule: actionPolicy,
  bookingCancel: actionPolicy,
  caseCreate: actionPolicy,
});

export const responseLanguage = v.union(
  v.literal("business_default"),
  v.literal("swedish"),
  v.literal("english"),
);

export const communicationTone = v.union(
  v.literal("neutral"),
  v.literal("warm"),
  v.literal("formal"),
);
