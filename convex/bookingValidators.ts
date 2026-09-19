import { v } from "convex/values";

export const resourceKind = v.union(
  v.literal("person"),
  v.literal("room"),
  v.literal("equipment"),
);

export const resourceStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

export const bookingStatus = v.union(
  v.literal("confirmed"),
  v.literal("cancelled"),
  v.literal("completed"),
);
