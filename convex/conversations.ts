import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requestForConversation, audit } from "./serviceRequests";
import { requireCurrentTenant } from "./tenant";

const conversationChannel = v.union(
  v.literal("web"),
  v.literal("sms"),
  v.literal("phone"),
  v.literal("email"),
  v.literal("other"),
);
const conversationStatus = v.union(v.literal("open"), v.literal("resolved"));
const clientSenderType = v.union(v.literal("customer"), v.literal("human"));

export type ConversationActivityType =
  | "booking_created"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "case_created"
  | "human_escalated";

type ConversationActivityEntity = {
  entityType: "booking" | "case";
  entityId: Id<"bookings"> | Id<"cases">;
};

function optionalText(
  value: string | undefined,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > maximumLength)
    throw new Error(`${field} is too long`);
  return normalized;
}

function requiredText(
  value: string,
  field: string,
  maximumLength: number,
): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${field} is required`);
  if (normalized.length > maximumLength)
    throw new Error(`${field} is too long`);
  return normalized;
}

export async function getAvailableConversation(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const tenant = await requireCurrentTenant(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (
    conversation === null ||
    conversation.organizationId !== tenant.organization._id
  ) {
    return null;
  }
  return conversation;
}

async function getTenantCustomer(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  customerId: Id<"customers">,
) {
  const customer = await ctx.db.get(customerId);
  if (customer === null || customer.organizationId !== organizationId) {
    throw new Error("Customer is unavailable");
  }
  return customer;
}

/**
 * Adds a minimal, tenant-scoped provenance record for a domain action that
 * originated from a conversation. Deliberately excludes tool arguments and
 * customer data so the timeline stays safe to expose in future dashboards.
 */
export async function recordConversationActivity(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  type: ConversationActivityType,
  entity: ConversationActivityEntity,
) {
  await ctx.db.insert("conversationEvents", {
    organizationId: conversation.organizationId,
    conversationId: conversation._id,
    type,
    entityType: entity.entityType,
    entityId: entity.entityId,
    createdAt: Date.now(),
  });
}

/** Shared append operation; AI/system messages are only written by server code. */
export async function appendConversationMessage(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  sender: "customer" | "ai" | "human" | "system",
  content: string,
) {
  const now = Date.now();
  await ctx.db.insert("conversationMessages", {
    organizationId: conversation.organizationId,
    conversationId: conversation._id,
    senderType: sender,
    content: requiredText(content, "Message content", 20_000),
    createdAt: now,
  });
  await ctx.db.patch("conversations", conversation._id, { updatedAt: now });
}

function openConversationDocument(
  conversation: NonNullable<
    Awaited<ReturnType<typeof getAvailableConversation>>
  >,
  updatedAt: number,
) {
  return {
    organizationId: conversation.organizationId,
    ...(conversation.customerId !== undefined
      ? { customerId: conversation.customerId }
      : {}),
    channel: conversation.channel,
    ...(conversation.subject !== undefined
      ? { subject: conversation.subject }
      : {}),
    status: "open" as const,
    createdAt: conversation.createdAt,
    updatedAt,
  };
}

export const list = query({
  args: { status: v.optional(conversationStatus) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    if (args.status !== undefined) {
      return await ctx.db
        .query("conversations")
        .withIndex("by_organizationId_and_status_and_updatedAt", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("conversations")
      .withIndex("by_organizationId_and_updatedAt", (q) =>
        q.eq("organizationId", tenant.organization._id),
      )
      .order("desc")
      .take(100);
  },
});

export const listForCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (
      customer === null ||
      customer.organizationId !== tenant.organization._id
    ) {
      return [];
    }
    return await ctx.db
      .query("conversations")
      .withIndex("by_organizationId_and_customerId_and_updatedAt", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("customerId", args.customerId),
      )
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) =>
    await getAvailableConversation(ctx, args.conversationId),
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    channel: conversationChannel,
    subject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    if (args.customerId !== undefined) {
      await getTenantCustomer(ctx, tenant.organization._id, args.customerId);
    }
    const subject = optionalText(args.subject, "Subject", 300);
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      organizationId: tenant.organization._id,
      ...(args.customerId !== undefined ? { customerId: args.customerId } : {}),
      channel: args.channel,
      ...(subject !== undefined ? { subject } : {}),
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationEvents", {
      organizationId: tenant.organization._id,
      conversationId,
      type: "conversation_created",
      createdAt: now,
    });
    return conversationId;
  },
});

export const linkCustomer = mutation({
  args: {
    conversationId: v.id("conversations"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) throw new Error("Conversation is unavailable");
    await getTenantCustomer(ctx, conversation.organizationId, args.customerId);
    const request = await requestForConversation(
      ctx,
      conversation._id,
      conversation.organizationId,
    );
    if (request?.customerId && request.customerId !== args.customerId)
      throw new Error("Customer must match linked request");
    const now = Date.now();
    if (request && !request.customerId) {
      await ctx.db.patch(request._id, {
        customerId: args.customerId,
        updatedAt: now,
      });
      await audit(ctx, request._id, "linked");
    }
    await ctx.db.patch("conversations", conversation._id, {
      customerId: args.customerId,
      updatedAt: now,
    });
    await ctx.db.insert("conversationEvents", {
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      type: "customer_linked",
      createdAt: now,
    });
  },
});

export const resolve = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) throw new Error("Conversation is unavailable");
    if (conversation.status !== "open")
      throw new Error("Conversation is not open");
    const now = Date.now();
    await ctx.db.patch("conversations", conversation._id, {
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationEvents", {
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      type: "resolved",
      createdAt: now,
    });
  },
});

export const reopen = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) throw new Error("Conversation is unavailable");
    if (conversation.status !== "resolved")
      throw new Error("Conversation is not resolved");
    const now = Date.now();
    await ctx.db.replace(
      "conversations",
      conversation._id,
      openConversationDocument(conversation, now),
    );
    await ctx.db.insert("conversationEvents", {
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      type: "reopened",
      createdAt: now,
    });
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) return [];
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_organizationId_and_conversationId_and_createdAt", (q) =>
        q
          .eq("organizationId", conversation.organizationId)
          .eq("conversationId", conversation._id),
      )
      .order("asc")
      .take(500);
  },
});

export const appendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    senderType: clientSenderType,
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) throw new Error("Conversation is unavailable");
    await appendConversationMessage(
      ctx,
      conversation,
      args.senderType,
      args.content,
    );
  },
});

export const listEvents = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) return [];
    return await ctx.db
      .query("conversationEvents")
      .withIndex("by_organizationId_and_conversationId_and_createdAt", (q) =>
        q
          .eq("organizationId", conversation.organizationId)
          .eq("conversationId", conversation._id),
      )
      .order("asc")
      .take(500);
  },
});
