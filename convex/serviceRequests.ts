import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentTenant } from "./tenant";
import {
  nextAction,
  requestStatus,
  requestSummary,
  workTarget,
} from "./workValidators";

type Ctx = QueryCtx | MutationCtx;
export function text(value: string, max: number, required = false) {
  const result = value.trim();
  if (result.length > max || (required && !result))
    throw new Error("Text is invalid");
  return result;
}
function summary(value: Doc<"serviceRequests">["summary"]) {
  return {
    wants: text(value.wants, 1000, true),
    known: text(value.known, 1000),
    missing: text(value.missing, 1000),
  };
}
export async function owned<
  T extends
    | "serviceRequests"
    | "cases"
    | "customers"
    | "services"
    | "conversations"
    | "bookings",
>(ctx: Ctx, id: Id<T>, organizationId: Id<"organizations">) {
  const doc = await ctx.db.get(id);
  if (!doc || doc.organizationId !== organizationId)
    throw new Error("Record is unavailable");
  return doc;
}
export async function audit(
  ctx: MutationCtx,
  target: Id<"serviceRequests"> | Id<"cases">,
  action: Doc<"workEvents">["action"],
) {
  const { organization, identity } = await requireCurrentTenant(ctx);
  await ctx.db.insert("workEvents", {
    organizationId: organization._id,
    target,
    action,
    actor: identity.tokenIdentifier,
    createdAt: Date.now(),
  });
}
export async function requestForConversation(
  ctx: Ctx,
  conversationId: Id<"conversations">,
  organizationId: Id<"organizations">,
) {
  await owned(ctx, conversationId, organizationId);
  return await ctx.db
    .query("serviceRequests")
    .withIndex("by_organizationId_and_initialConversationId", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("initialConversationId", conversationId),
    )
    .unique();
}

export const create = mutation({
  args: {
    title: v.string(),
    summary: requestSummary,
    customerId: v.optional(v.id("customers")),
    serviceId: v.optional(v.id("services")),
    initialConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const { organization } = await requireCurrentTenant(ctx);
    const title = text(args.title, 200, true);
    const normalizedSummary = summary(args.summary);
    const conversation = args.initialConversationId
      ? await owned(ctx, args.initialConversationId, organization._id)
      : null;
    const customerId = args.customerId ?? conversation?.customerId;
    if (customerId) await owned(ctx, customerId, organization._id);
    const service = args.serviceId
      ? await owned(ctx, args.serviceId, organization._id)
      : null;
    if (
      conversation?.customerId &&
      args.customerId &&
      conversation.customerId !== args.customerId
    )
      throw new Error("Customer must match conversation");
    if (
      conversation &&
      (await requestForConversation(ctx, conversation._id, organization._id))
    )
      throw new Error("Conversation already has a request");
    const escalation = conversation
      ? await ctx.db
          .query("cases")
          .withIndex(
            "by_organizationId_and_conversationId_and_source_and_status",
            (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("conversationId", conversation._id)
                .eq("source", "human_escalation")
                .eq("status", "open"),
          )
          .unique()
      : null;
    if (escalation?.serviceRequestId)
      throw new Error("Escalation already belongs to a request");
    const now = Date.now();
    const id = await ctx.db.insert("serviceRequests", {
      ...args,
      title,
      summary: normalizedSummary,
      customerId,
      ...(service
        ? { serviceName: service.name, servicePricing: service.pricing }
        : {}),
      organizationId: organization._id,
      status: "new",
      attention: "requested",
      attentionReason: "Ny förfrågan att bedöma",
      nextAction: "human_review",
      createdAt: now,
      updatedAt: now,
    });
    // Continue an existing escalation without deleting its history.
    if (escalation) {
      await ctx.db.patch(escalation._id, {
        serviceRequestId: id,
        updatedAt: now,
      });
      await ctx.db.patch(id, {
        attentionReason:
          escalation.description?.slice(0, 2000) ||
          "Mänsklig hjälp efterfrågas",
      });
      await audit(ctx, escalation._id, "linked");
    }
    await audit(ctx, id, "created");
    return id;
  },
});

export const get = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const { organization } = await requireCurrentTenant(ctx);
    return await owned(ctx, args.requestId, organization._id);
  },
});

export const update = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    title: v.optional(v.string()),
    summary: v.optional(requestSummary),
    status: v.optional(requestStatus),
    nextAction: v.optional(nextAction),
    bookingId: v.optional(v.id("bookings")),
    customerId: v.optional(v.id("customers")),
    serviceId: v.optional(v.id("services")),
  },
  handler: async (ctx, args) => {
    const { organization } = await requireCurrentTenant(ctx);
    const request = await owned(ctx, args.requestId, organization._id);
    const customerId = args.customerId ?? request.customerId;
    const serviceId = args.serviceId ?? request.serviceId;
    if (customerId) await owned(ctx, customerId, organization._id);
    const service = serviceId
      ? await owned(ctx, serviceId, organization._id)
      : null;
    if (request.customerId && customerId !== request.customerId)
      throw new Error("An established customer cannot be replaced");
    if (request.initialConversationId && customerId) {
      const conversation = await owned(
        ctx,
        request.initialConversationId,
        organization._id,
      );
      if (conversation.customerId && conversation.customerId !== customerId)
        throw new Error("Customer must match conversation");
    }
    const status = args.status ?? request.status;
    const terminal = (s: string) => s === "completed" || s === "cancelled";
    if (
      terminal(request.status) &&
      status !== request.status &&
      status !== "active"
    )
      throw new Error("Reopen request as active first");
    if (
      terminal(status) &&
      (request.attention === "requested" ||
        request.attention === "acknowledged")
    )
      throw new Error("Resolve attention before closing request");
    const bookingId = args.bookingId ?? request.bookingId;
    if (bookingId) {
      const booking = await owned(ctx, bookingId, organization._id);
      if (!customerId || booking.customerId !== customerId)
        throw new Error("Booking customer must match request");
      if (serviceId && booking.serviceId !== serviceId)
        throw new Error("Booking service must match request");
      if (status === "scheduled" && booking.status !== "confirmed")
        throw new Error("A confirmed booking is required");
    } else if (status === "scheduled")
      throw new Error("A confirmed booking is required");
    await ctx.db.patch(request._id, {
      title:
        args.title === undefined ? request.title : text(args.title, 200, true),
      summary:
        args.summary === undefined ? request.summary : summary(args.summary),
      status,
      nextAction: terminal(status)
        ? "none"
        : (args.nextAction ?? request.nextAction),
      bookingId,
      customerId,
      serviceId,
      ...(service
        ? { serviceName: service.name, servicePricing: service.pricing }
        : {}),
      updatedAt: Date.now(),
    });
    await audit(ctx, request._id, "updated");
  },
});

export const linkCase = mutation({
  args: { requestId: v.id("serviceRequests"), caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const { organization } = await requireCurrentTenant(ctx);
    const request = await owned(ctx, args.requestId, organization._id);
    const record = await owned(ctx, args.caseId, organization._id);
    if (record.serviceRequestId && record.serviceRequestId !== request._id)
      throw new Error("Case is already linked");
    if (
      record.conversationId &&
      request.initialConversationId &&
      record.conversationId !== request.initialConversationId
    )
      throw new Error("Case conversation must match request");
    if (record.customerId && request.customerId !== record.customerId)
      throw new Error("Case customer must match request");
    if (
      record.status === "open" &&
      (request.status === "completed" || request.status === "cancelled")
    )
      throw new Error("Reopen request first");
    if (record.conversationId && !request.initialConversationId) {
      const other = await requestForConversation(
        ctx,
        record.conversationId,
        organization._id,
      );
      if (other && other._id !== request._id)
        throw new Error("Conversation already has a request");
      await ctx.db.patch(request._id, {
        initialConversationId: record.conversationId,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch(record._id, {
      serviceRequestId: request._id,
      updatedAt: Date.now(),
    });
    if (record.status === "open")
      await requestAttention(
        ctx,
        request,
        "Kopplat uppföljningsärende behöver granskas",
      );
    await audit(ctx, record._id, "linked");
  },
});

/** Server helper called by the explicit escalation tool, never model-dispatched. */
export async function requestAttention(
  ctx: MutationCtx,
  request: Doc<"serviceRequests">,
  reason: string,
) {
  const normalized = text(reason, 2000, true);
  const current = await owned(
    ctx,
    request._id,
    (await requireCurrentTenant(ctx)).organization._id,
  );
  // Repeated escalation preserves a staff acknowledgment; a new reason remains visible.
  await ctx.db.patch(current._id, {
    attention:
      current.attention === "acknowledged" ? "acknowledged" : "requested",
    attentionReason: normalized,
    nextAction: "human_review",
    updatedAt: Date.now(),
  });
  await audit(ctx, current._id, "requested");
}

export const attention = mutation({
  args: {
    target: workTarget,
    action: v.union(
      v.literal("request"),
      v.literal("acknowledge"),
      v.literal("resolve"),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organization, identity } = await requireCurrentTenant(ctx);
    const record = await owned(ctx, args.target, organization._id);
    const now = Date.now();
    if ("summary" in record) {
      if (args.action === "request") {
        await requestAttention(
          ctx,
          record,
          text(args.reason ?? "", 2000, true),
        );
        return;
      }
      if (
        record.attention !== "requested" &&
        record.attention !== "acknowledged"
      )
        throw new Error("No active attention");
      if (
        args.action === "acknowledge" &&
        record.acknowledgedBy &&
        record.acknowledgedBy !== identity.tokenIdentifier
      )
        throw new Error("Already acknowledged by another colleague");
      await ctx.db.patch(record._id, {
        attention: args.action === "acknowledge" ? "acknowledged" : "resolved",
        acknowledgedBy:
          args.action === "acknowledge" ? identity.tokenIdentifier : undefined,
        nextAction: args.action === "resolve" ? "none" : record.nextAction,
        updatedAt: now,
      });
    } else {
      if (record.serviceRequestId)
        throw new Error("Use the linked request attention controls");
      if (args.action === "request")
        throw new Error("Reopen the case to request attention");
      if (record.status !== "open") throw new Error("Case is not open");
      if (
        args.action === "acknowledge" &&
        record.acknowledgedBy &&
        record.acknowledgedBy !== identity.tokenIdentifier
      )
        throw new Error("Already acknowledged by another colleague");
      await ctx.db.patch(record._id, {
        acknowledgedBy:
          args.action === "acknowledge" ? identity.tokenIdentifier : undefined,
        status: args.action === "resolve" ? "resolved" : "open",
        resolvedAt: args.action === "resolve" ? now : undefined,
        updatedAt: now,
      });
    }
    await audit(
      ctx,
      record._id,
      args.action === "acknowledge" ? "acknowledged" : "resolved",
    );
  },
});
