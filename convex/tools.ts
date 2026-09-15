import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { findBlockingBooking, validateBookingInterval } from "./availability";
import {
  cancelTenantBooking,
  createTenantBooking,
  rescheduleTenantBooking,
} from "./bookings";
import {
  createTenantCase,
  getOpenHumanEscalationCase,
} from "./cases";
import {
  getAvailableConversation,
  recordConversationActivity,
} from "./conversations";
import { searchActiveKnowledge } from "./knowledge";
import { listActiveTenantServices } from "./services";
import { requireCurrentTenant } from "./tenant";
import { APPROVED_TOOL_DEFINITIONS } from "./toolRegistry";

const customerFindBy = v.union(
  v.literal("email"),
  v.literal("phone"),
  v.literal("name"),
);
const casePriority = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
);

const readToolRequest = v.union(
  v.object({
    toolName: v.literal("knowledge.search"),
    args: v.object({ query: v.string(), limit: v.optional(v.number()) }),
  }),
  v.object({
    toolName: v.literal("customer.find"),
    args: v.object({
      by: customerFindBy,
      value: v.string(),
      limit: v.optional(v.number()),
    }),
  }),
  v.object({ toolName: v.literal("service.list"), args: v.object({}) }),
  v.object({
    toolName: v.literal("availability.check"),
    args: v.object({ startTime: v.number(), endTime: v.number() }),
  }),
);

const writeToolRequest = v.union(
  v.object({
    toolName: v.literal("booking.create"),
    args: v.object({
      customerId: v.id("customers"),
      serviceId: v.id("services"),
      startTime: v.number(),
      endTime: v.number(),
      notes: v.optional(v.string()),
      conversationId: v.optional(v.id("conversations")),
    }),
  }),
  v.object({
    toolName: v.literal("booking.reschedule"),
    args: v.object({
      bookingId: v.id("bookings"),
      startTime: v.number(),
      endTime: v.number(),
      conversationId: v.optional(v.id("conversations")),
    }),
  }),
  v.object({
    toolName: v.literal("booking.cancel"),
    args: v.object({
      bookingId: v.id("bookings"),
      conversationId: v.optional(v.id("conversations")),
    }),
  }),
  v.object({
    toolName: v.literal("case.create"),
    args: v.object({
      conversationId: v.optional(v.id("conversations")),
      customerId: v.optional(v.id("customers")),
      title: v.string(),
      description: v.optional(v.string()),
      priority: v.optional(casePriority),
    }),
  }),
  v.object({
    toolName: v.literal("human.escalate"),
    args: v.object({ conversationId: v.id("conversations"), reason: v.string() }),
  }),
);

type ToolErrorCode =
  | "unauthorized"
  | "unavailable"
  | "conflict"
  | "already_done"
  | "validation_error";

function success<T>(data: T) {
  return { ok: true as const, data };
}

function failure(code: ToolErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Returns controlled, non-sensitive errors instead of database details. */
function toolFailure(error: unknown) {
  const sourceMessage = error instanceof Error ? error.message : "";

  if (
    sourceMessage === "Not authenticated" ||
    sourceMessage.includes("active Clerk organization")
  ) {
    return failure("unauthorized", "A verified active workspace is required.");
  }
  if (sourceMessage === "The requested time is unavailable") {
    return failure("conflict", "The requested time is unavailable.");
  }
  if (
    sourceMessage.includes("Only confirmed") ||
    sourceMessage.includes("is not open") ||
    sourceMessage.includes("is not resolved")
  ) {
    return failure("already_done", "The requested action is no longer available.");
  }
  if (
    sourceMessage.includes("unavailable") ||
    sourceMessage.includes("has not been provisioned")
  ) {
    return failure("unavailable", "The requested resource is unavailable.");
  }
  return failure("validation_error", "The tool request could not be completed.");
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 10;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new Error("Tool result limit is invalid");
  }
  return value;
}

function requiredToolText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function exactCustomerValue(
  by: "email" | "phone" | "name",
  value: string,
): string {
  const normalized = value.trim();
  const maximumLength = by === "email" ? 320 : by === "phone" ? 64 : 200;
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error("Customer search value is invalid");
  }
  return by === "email" ? normalized.toLowerCase() : normalized;
}

async function findCustomers(
  ctx: QueryCtx,
  args: {
    by: "email" | "phone" | "name";
    value: string;
    limit?: number;
  },
) {
  const tenant = await requireCurrentTenant(ctx);
  const value = exactCustomerValue(args.by, args.value);
  const limit = boundedLimit(args.limit);
  const customers =
    args.by === "email"
      ? await ctx.db
          .query("customers")
          .withIndex("by_organizationId_and_email_and_status", (q) =>
            q
              .eq("organizationId", tenant.organization._id)
              .eq("email", value)
              .eq("status", "active"),
          )
          .take(limit)
      : args.by === "phone"
        ? await ctx.db
            .query("customers")
            .withIndex("by_organizationId_and_phone_and_status", (q) =>
              q
                .eq("organizationId", tenant.organization._id)
                .eq("phone", value)
                .eq("status", "active"),
            )
            .take(limit)
        : await ctx.db
            .query("customers")
            .withIndex("by_organizationId_and_name_and_status", (q) =>
              q
                .eq("organizationId", tenant.organization._id)
                .eq("name", value)
                .eq("status", "active"),
            )
            .take(limit);

  return customers.map((customer) => ({
    customerId: customer._id,
    name: customer.name,
    ...(args.by === "email" && customer.email !== undefined
      ? { email: customer.email }
      : {}),
    ...(args.by === "phone" && customer.phone !== undefined
      ? { phone: customer.phone }
      : {}),
  }));
}

async function getConversationContext(
  ctx: MutationCtx,
  conversationId: Id<"conversations"> | undefined,
) {
  if (conversationId === undefined) return null;
  const conversation = await getAvailableConversation(ctx, conversationId);
  if (conversation === null) throw new Error("Conversation is unavailable");
  return conversation;
}

function ensureConversationCustomer(
  conversation: Awaited<ReturnType<typeof getConversationContext>>,
  customerId: Id<"customers">,
) {
  if (
    conversation !== null &&
    conversation.customerId !== undefined &&
    conversation.customerId !== customerId
  ) {
    throw new Error("Booking customer must match the linked conversation");
  }
}

export const listDefinitions = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentTenant(ctx);
    return APPROVED_TOOL_DEFINITIONS.map((definition) => ({ ...definition }));
  },
});

/**
 * Read-only approved tools. The discriminated request validator is the
 * allowlist: no arbitrary function name or database operation is accepted.
 */
export const executeRead = query({
  args: { request: readToolRequest },
  handler: async (ctx, args) => {
    try {
      const tenant = await requireCurrentTenant(ctx);
      switch (args.request.toolName) {
        case "knowledge.search": {
          const entries = await searchActiveKnowledge(ctx, args.request.args);
          return success({ entries });
        }
        case "customer.find":
          return success({ customers: await findCustomers(ctx, args.request.args) });
        case "service.list": {
          const services = await listActiveTenantServices(ctx);
          return success({
            services: services.map((service) => ({
              serviceId: service._id,
              name: service.name,
              ...(service.durationMinutes !== undefined
                ? { durationMinutes: service.durationMinutes }
                : {}),
              pricing: service.pricing,
            })),
          });
        }
        case "availability.check": {
          validateBookingInterval(
            args.request.args.startTime,
            args.request.args.endTime,
          );
          const blockingBooking = await findBlockingBooking(
            ctx,
            tenant.organization._id,
            args.request.args.startTime,
            args.request.args.endTime,
          );
          return success({ available: blockingBooking === null });
        }
      }
    } catch (error) {
      return toolFailure(error);
    }
  },
});

/**
 * State-changing approved tools. Each branch calls a named domain operation;
 * no client or future AI caller can select an arbitrary backend function.
 */
export const executeWrite = mutation({
  args: { request: writeToolRequest },
  handler: async (ctx, args) => {
    try {
      await requireCurrentTenant(ctx);
      switch (args.request.toolName) {
        case "booking.create": {
          const conversation = await getConversationContext(
            ctx,
            args.request.args.conversationId,
          );
          ensureConversationCustomer(conversation, args.request.args.customerId);
          const bookingId = await createTenantBooking(ctx, args.request.args);
          if (conversation !== null) {
            await recordConversationActivity(ctx, conversation, "booking_created", {
              entityType: "booking",
              entityId: bookingId,
            });
          }
          return success({
            bookingId,
            status: "confirmed" as const,
            startTime: args.request.args.startTime,
            endTime: args.request.args.endTime,
          });
        }
        case "booking.reschedule": {
          const conversation = await getConversationContext(
            ctx,
            args.request.args.conversationId,
          );
          const bookingId = await rescheduleTenantBooking(ctx, args.request.args);
          if (conversation !== null) {
            await recordConversationActivity(ctx, conversation, "booking_rescheduled", {
              entityType: "booking",
              entityId: bookingId,
            });
          }
          return success({
            bookingId,
            status: "confirmed" as const,
            startTime: args.request.args.startTime,
            endTime: args.request.args.endTime,
          });
        }
        case "booking.cancel": {
          const conversation = await getConversationContext(
            ctx,
            args.request.args.conversationId,
          );
          const bookingId = await cancelTenantBooking(ctx, args.request.args.bookingId);
          if (conversation !== null) {
            await recordConversationActivity(ctx, conversation, "booking_cancelled", {
              entityType: "booking",
              entityId: bookingId,
            });
          }
          return success({ bookingId, status: "cancelled" as const });
        }
        case "case.create": {
          const caseId = await createTenantCase(ctx, args.request.args);
          return success({ caseId, status: "open" as const });
        }
        case "human.escalate": {
          const conversation = await getConversationContext(
            ctx,
            args.request.args.conversationId,
          );
          if (conversation === null) throw new Error("Conversation is unavailable");
          const existingCase = await getOpenHumanEscalationCase(
            ctx,
            conversation._id,
            conversation.organizationId,
          );
          if (existingCase !== null) {
            return success({
              caseId: existingCase._id,
              status: existingCase.status,
              created: false,
            });
          }
          const caseId = await createTenantCase(ctx, {
            conversationId: conversation._id,
            title: "Human follow-up requested",
            description: requiredToolText(
              args.request.args.reason,
              "Escalation reason",
              2_000,
            ),
            priority: "high",
            source: "human_escalation",
            conversationActivityType: "human_escalated",
          });
          return success({ caseId, status: "open" as const, created: true });
        }
      }
    } catch (error) {
      return toolFailure(error);
    }
  },
});
