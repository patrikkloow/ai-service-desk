import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  getAvailableConversation,
  recordConversationActivity,
  type ConversationActivityType,
} from "./conversations";
import { requireCurrentTenant } from "./tenant";

const caseStatus = v.union(v.literal("open"), v.literal("resolved"));
const casePriority = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
);

export type CasePriority = "low" | "normal" | "high";
type CaseSource = "human_escalation";

export type CreateTenantCaseArgs = {
  conversationId?: Id<"conversations">;
  customerId?: Id<"customers">;
  title: string;
  description?: string;
  priority?: CasePriority;
  source?: CaseSource;
  conversationActivityType?: ConversationActivityType;
};

function requiredText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${field} is required`);
  if (normalized.length > maximumLength) throw new Error(`${field} is too long`);
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > maximumLength) throw new Error(`${field} is too long`);
  return normalized;
}

async function getAvailableCase(
  ctx: QueryCtx | MutationCtx,
  caseId: Id<"cases">,
) {
  const tenant = await requireCurrentTenant(ctx);
  const caseRecord = await ctx.db.get(caseId);
  if (caseRecord === null || caseRecord.organizationId !== tenant.organization._id) {
    return null;
  }
  return caseRecord;
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

function openCaseDocument(
  caseRecord: NonNullable<Awaited<ReturnType<typeof getAvailableCase>>>,
  updatedAt: number,
) {
  return {
    organizationId: caseRecord.organizationId,
    ...(caseRecord.conversationId !== undefined
      ? { conversationId: caseRecord.conversationId }
      : {}),
    ...(caseRecord.customerId !== undefined
      ? { customerId: caseRecord.customerId }
      : {}),
    title: caseRecord.title,
    ...(caseRecord.description !== undefined
      ? { description: caseRecord.description }
      : {}),
    ...(caseRecord.source !== undefined ? { source: caseRecord.source } : {}),
    priority: caseRecord.priority,
    status: "open" as const,
    createdAt: caseRecord.createdAt,
    updatedAt,
  };
}

/**
 * The authoritative case creation operation used by both the public case
 * mutation and approved tools. It verifies every linked resource before any
 * write and records only safe conversation provenance.
 */
export async function createTenantCase(
  ctx: MutationCtx,
  args: CreateTenantCaseArgs,
) {
  const tenant = await requireCurrentTenant(ctx);
  const conversation =
    args.conversationId === undefined
      ? null
      : await getAvailableConversation(ctx, args.conversationId);
  if (args.conversationId !== undefined && conversation === null) {
    throw new Error("Conversation is unavailable");
  }
  if (args.customerId !== undefined) {
    await getTenantCustomer(ctx, tenant.organization._id, args.customerId);
  }
  if (
    conversation?.customerId !== undefined &&
    args.customerId !== undefined &&
    conversation.customerId !== args.customerId
  ) {
    throw new Error("Case customer must match the linked conversation");
  }

  const customerId = args.customerId ?? conversation?.customerId;
  const description = optionalText(args.description, "Description", 20_000);
  const now = Date.now();
  const caseId = await ctx.db.insert("cases", {
    organizationId: tenant.organization._id,
    ...(conversation !== null ? { conversationId: conversation._id } : {}),
    ...(customerId !== undefined ? { customerId } : {}),
    title: requiredText(args.title, "Title", 300),
    ...(description !== undefined ? { description } : {}),
    ...(args.source !== undefined ? { source: args.source } : {}),
    priority: args.priority ?? "normal",
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  if (conversation !== null) {
    await recordConversationActivity(
      ctx,
      conversation,
      args.conversationActivityType ?? "case_created",
      { entityType: "case", entityId: caseId },
    );
  }
  return caseId;
}

export async function getOpenHumanEscalationCase(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("cases")
    .withIndex("by_organizationId_and_conversationId_and_source_and_status", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("conversationId", conversationId)
        .eq("source", "human_escalation")
        .eq("status", "open"),
    )
    .unique();
}

export const list = query({
  args: { status: v.optional(caseStatus) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    if (args.status !== undefined) {
      return await ctx.db
        .query("cases")
        .withIndex("by_organizationId_and_status_and_updatedAt", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("cases")
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
    if (customer === null || customer.organizationId !== tenant.organization._id) {
      return [];
    }
    return await ctx.db
      .query("cases")
      .withIndex("by_organizationId_and_customerId_and_updatedAt", (q) =>
        q
          .eq("organizationId", tenant.organization._id)
          .eq("customerId", args.customerId),
      )
      .order("desc")
      .take(100);
  },
});

export const listForConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(ctx, args.conversationId);
    if (conversation === null) return [];
    return await ctx.db
      .query("cases")
      .withIndex("by_organizationId_and_conversationId_and_updatedAt", (q) =>
        q
          .eq("organizationId", conversation.organizationId)
          .eq("conversationId", conversation._id),
      )
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => await getAvailableCase(ctx, args.caseId),
});

export const create = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    customerId: v.optional(v.id("customers")),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(casePriority),
  },
  handler: async (ctx, args) => await createTenantCase(ctx, args),
});

export const update = mutation({
  args: {
    caseId: v.id("cases"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(casePriority),
  },
  handler: async (ctx, args) => {
    const caseRecord = await getAvailableCase(ctx, args.caseId);
    if (caseRecord === null) throw new Error("Case is unavailable");
    if (
      args.title === undefined &&
      args.description === undefined &&
      args.priority === undefined
    ) {
      throw new Error("No case changes supplied");
    }
    const description =
      args.description === undefined
        ? caseRecord.description
        : optionalText(args.description, "Description", 20_000);
    await ctx.db.replace("cases", caseRecord._id, {
      organizationId: caseRecord.organizationId,
      ...(caseRecord.conversationId !== undefined
        ? { conversationId: caseRecord.conversationId }
        : {}),
      ...(caseRecord.customerId !== undefined
        ? { customerId: caseRecord.customerId }
        : {}),
      title:
        args.title === undefined
          ? caseRecord.title
          : requiredText(args.title, "Title", 300),
      ...(description !== undefined ? { description } : {}),
      ...(caseRecord.source !== undefined ? { source: caseRecord.source } : {}),
      priority: args.priority ?? caseRecord.priority,
      status: caseRecord.status,
      ...(caseRecord.resolvedAt !== undefined
        ? { resolvedAt: caseRecord.resolvedAt }
        : {}),
      createdAt: caseRecord.createdAt,
      updatedAt: Date.now(),
    });
  },
});

export const resolve = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const caseRecord = await getAvailableCase(ctx, args.caseId);
    if (caseRecord === null) throw new Error("Case is unavailable");
    if (caseRecord.status !== "open") throw new Error("Case is not open");
    const now = Date.now();
    await ctx.db.patch("cases", caseRecord._id, {
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    });
  },
});

export const reopen = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const caseRecord = await getAvailableCase(ctx, args.caseId);
    if (caseRecord === null) throw new Error("Case is unavailable");
    if (caseRecord.status !== "resolved") throw new Error("Case is not resolved");
    await ctx.db.replace(
      "cases",
      caseRecord._id,
      openCaseDocument(caseRecord, Date.now()),
    );
  },
});
