import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCurrentTenant } from "./tenant";

const knowledgeStatus = v.union(v.literal("active"), v.literal("inactive"));
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;

function requiredText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${field} is required`);
  }

  if (normalized.length > maximumLength) {
    throw new Error(`${field} is too long`);
  }

  return normalized;
}

function searchText(title: string, content: string): string {
  return `${title}\n${content}`;
}

function searchLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }

  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEARCH_LIMIT) {
    throw new Error(`Search limit must be between 1 and ${MAX_SEARCH_LIMIT}`);
  }

  return value;
}

async function getAvailableKnowledge(
  ctx: QueryCtx | MutationCtx,
  knowledgeId: Id<"knowledgeEntries">,
) {
  const tenant = await requireCurrentTenant(ctx);
  const knowledge = await ctx.db.get(knowledgeId);

  if (knowledge === null || knowledge.organizationId !== tenant.organization._id) {
    return null;
  }

  return knowledge;
}

export const list = query({
  args: { status: v.optional(knowledgeStatus) },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);

    if (args.status !== undefined) {
      return await ctx.db
        .query("knowledgeEntries")
        .withIndex("by_organizationId_and_status", (q) =>
          q
            .eq("organizationId", tenant.organization._id)
            .eq("status", args.status!),
        )
        .order("desc")
        .take(100);
    }

    return await ctx.db
      .query("knowledgeEntries")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", tenant.organization._id),
      )
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { knowledgeId: v.id("knowledgeEntries") },
  handler: async (ctx, args) => await getAvailableKnowledge(ctx, args.knowledgeId),
});

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const title = requiredText(args.title, "Title", 300);
    const content = requiredText(args.content, "Content", 50_000);
    const now = Date.now();

    return await ctx.db.insert("knowledgeEntries", {
      organizationId: tenant.organization._id,
      title,
      content,
      searchText: searchText(title, content),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    knowledgeId: v.id("knowledgeEntries"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const knowledge = await getAvailableKnowledge(ctx, args.knowledgeId);

    if (knowledge === null) {
      throw new Error("Knowledge entry is unavailable");
    }

    if (args.title === undefined && args.content === undefined) {
      throw new Error("No knowledge changes supplied");
    }

    const title =
      args.title === undefined
        ? knowledge.title
        : requiredText(args.title, "Title", 300);
    const content =
      args.content === undefined
        ? knowledge.content
        : requiredText(args.content, "Content", 50_000);

    await ctx.db.patch("knowledgeEntries", knowledge._id, {
      title,
      content,
      searchText: searchText(title, content),
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    knowledgeId: v.id("knowledgeEntries"),
    status: knowledgeStatus,
  },
  handler: async (ctx, args) => {
    const knowledge = await getAvailableKnowledge(ctx, args.knowledgeId);

    if (knowledge === null) {
      throw new Error("Knowledge entry is unavailable");
    }

    await ctx.db.patch("knowledgeEntries", knowledge._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Returns only active, tenant-scoped source entries for future AI retrieval.
 * Empty searches intentionally return no evidence rather than every entry.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireCurrentTenant(ctx);
    const searchQuery = args.query.trim();

    if (searchQuery.length === 0) {
      return [];
    }

    if (searchQuery.length > 200) {
      throw new Error("Search query is too long");
    }

    const entries = await ctx.db
      .query("knowledgeEntries")
      .withSearchIndex("search_by_searchText_and_organizationId_and_status", (q) =>
        q
          .search("searchText", searchQuery)
          .eq("organizationId", tenant.organization._id)
          .eq("status", "active"),
      )
      .take(searchLimit(args.limit));

    return entries.map((entry) => ({
      knowledgeId: entry._id,
      title: entry.title,
      content: entry.content,
      updatedAt: entry.updatedAt,
    }));
  },
});
