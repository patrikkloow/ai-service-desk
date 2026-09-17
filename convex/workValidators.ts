import { v } from "convex/values";

export const requestStatus = v.union(
  v.literal("new"),
  v.literal("active"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled"),
);
export const attentionState = v.union(
  v.literal("none"),
  v.literal("requested"),
  v.literal("acknowledged"),
  v.literal("resolved"),
);
export const nextAction = v.union(
  v.literal("ask_customer"),
  v.literal("book_assessment"),
  v.literal("human_review"),
  v.literal("wait"),
  v.literal("none"),
);
export const requestSummary = v.object({
  wants: v.string(),
  known: v.string(),
  missing: v.string(),
});
export const workTarget = v.union(v.id("serviceRequests"), v.id("cases"));
