import { requireCurrentTenant } from "./tenant";
import { createRuntimeAdapter } from "./modelRuntime";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  MAX_CUSTOMER_MESSAGE_CHARS,
  runOrchestrationLoop,
  type ModelToolRequest,
  type OrchestrationResult,
  type ToolExecution,
} from "./orchestratorCore";
import { type ModelAdapter } from "./modelAdapter";

type CustomerTurnArgs = {
  conversationId: Id<"conversations">;
  message: string;
};

function normalizedCustomerMessage(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= MAX_CUSTOMER_MESSAGE_CHARS
    ? normalized
    : null;
}

function unavailableTurnResult(): {
  ok: false;
  provider: "development_fake";
  error: { code: "unavailable" | "validation_error"; message: string };
  executedTools: Array<never>;
} {
  return {
    ok: false,
    provider: "development_fake",
    error: {
      code: "unavailable",
      message: "The requested conversation is unavailable.",
    },
    executedTools: [],
  };
}

function orchestrationFailure(
  result: Exclude<OrchestrationResult, { ok: true }>,
) {
  return {
    ok: false as const,
    provider: result.metadata.provider,
    metadata: result.metadata,
    error: result.error,
    executedTools: result.executedTools,
  };
}

async function executeCurrentConversationTool(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  request: ModelToolRequest,
): Promise<ToolExecution> {
  try {
    switch (request.toolName) {
      case "knowledge.search":
      case "customer.find":
      case "service.list":
      case "availability.check":
        return {
          kind: "completed",
          result: await ctx.runQuery(api.tools.executeRead, {
            request: request as never,
          }),
        };
      case "booking.create":
        return {
          kind: "completed",
          result: await ctx.runMutation(api.tools.executeWrite, {
            request: {
              toolName: "booking.create",
              args: {
                customerId: request.args.customerId as Id<"customers">,
                serviceId: request.args.serviceId as Id<"services">,
                startTime: request.args.startTime,
                endTime: request.args.endTime,
                ...(request.args.notes === undefined
                  ? {}
                  : { notes: request.args.notes }),
                conversationId,
              },
            },
          }),
        };
      case "booking.reschedule":
        return {
          kind: "completed",
          result: await ctx.runMutation(api.tools.executeWrite, {
            request: {
              toolName: "booking.reschedule",
              args: {
                bookingId: request.args.bookingId as Id<"bookings">,
                startTime: request.args.startTime,
                endTime: request.args.endTime,
                conversationId,
              },
            },
          }),
        };
      case "booking.cancel":
        return {
          kind: "completed",
          result: await ctx.runMutation(api.tools.executeWrite, {
            request: {
              toolName: "booking.cancel",
              args: {
                bookingId: request.args.bookingId as Id<"bookings">,
                conversationId,
              },
            },
          }),
        };
      case "case.create":
        return {
          kind: "completed",
          result: await ctx.runMutation(api.tools.executeWrite, {
            request: {
              toolName: "case.create",
              args: {
                conversationId,
                title: request.args.title,
                ...(request.args.customerId === undefined
                  ? {}
                  : { customerId: request.args.customerId as Id<"customers"> }),
                ...(request.args.description === undefined
                  ? {}
                  : { description: request.args.description }),
                ...(request.args.priority === undefined
                  ? {}
                  : { priority: request.args.priority }),
              },
            },
          }),
        };
      case "human.escalate":
        return {
          kind: "completed",
          result: await ctx.runMutation(api.tools.executeWrite, {
            request: {
              toolName: "human.escalate",
              args: { conversationId, reason: request.args.reason },
            },
          }),
        };
    }
  } catch {
    return {
      kind: "uncertain",
      error: {
        code: "execution_failed",
        message: "The tool execution result was uncertain.",
      },
    };
  }
}

/**
 * Processes one authenticated customer turn. The public action accepts no
 * tenant authority, prompt, tool definition, provider setting, or tool args.
 */
export async function processCustomerTurn(
  ctx: ActionCtx,
  args: CustomerTurnArgs,
  adapter: ModelAdapter,
) {
  const message = normalizedCustomerMessage(args.message);
  if (message === null) {
    return {
      ok: false as const,
      provider: "development_fake" as const,
      error: {
        code: "validation_error" as const,
        message: "Customer message is invalid.",
      },
      executedTools: [],
    };
  }

  try {
    await ctx.runMutation(api.conversations.appendMessage, {
      conversationId: args.conversationId,
      senderType: "customer",
      content: message,
    });
  } catch {
    return unavailableTurnResult();
  }

  let context;
  try {
    context = await ctx.runQuery(
      internal.orchestratorInternal.loadConversationContext,
      {
        conversationId: args.conversationId,
      },
    );
  } catch {
    return unavailableTurnResult();
  }

  const result = await runOrchestrationLoop({
    adapter,
    context,
    executeTool: async (request) =>
      await executeCurrentConversationTool(ctx, args.conversationId, request),
  });
  // Deliberately log only allowlisted timing/outcome metadata, never context or arguments.
  if (!result.ok) {
    result.metadata.responsePersistence = "not_attempted";
    console.info("ai_run", result.metadata);
    return orchestrationFailure(result);
  }

  try {
    await ctx.runMutation(internal.orchestratorInternal.appendAiResponse, {
      conversationId: args.conversationId,
      content: result.response,
    });
  } catch {
    result.metadata.responsePersistence = "failed";
    console.info("ai_run", result.metadata);
    return {
      ok: false as const,
      provider: result.metadata.provider,
      metadata: result.metadata,
      error: {
        code: "provider_unavailable" as const,
        message:
          "Svaret kunde inte sparas. En åtgärd kan redan ha genomförts; kontrollera utfallet innan du försöker igen.",
      },
      executedTools: result.executedTools,
    };
  }

  result.metadata.responsePersistence = "saved";
  console.info("ai_run", result.metadata);
  return {
    ok: true as const,
    provider: result.metadata.provider,
    metadata: result.metadata,
    response: result.response,
    executedTools: result.executedTools,
  };
}

export const processCustomerMessage = action({
  args: { conversationId: v.id("conversations"), message: v.string() },
  handler: async (ctx, args) => {
    // Check tenant/conversation before configuration diagnostics or any paid call.
    try {
      await ctx.runQuery(
        internal.orchestratorInternal.loadConversationContext,
        { conversationId: args.conversationId },
      );
    } catch {
      return unavailableTurnResult();
    }
    let adapter: ModelAdapter;
    try {
      adapter = createRuntimeAdapter();
    } catch {
      return {
        ok: false as const,
        provider: "unavailable",
        error: {
          code: "configuration" as const,
          message:
            "Live AI configuration is unavailable. Check server mode, model and credentials.",
        },
        executedTools: [],
      };
    }
    return await processCustomerTurn(ctx, args, adapter);
  },
});

export const runtimeInfo = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentTenant(ctx);
    try {
      return createRuntimeAdapter().metadata!;
    } catch {
      return {
        provider: "unavailable",
        model: "unavailable",
        mode: "unavailable",
      };
    }
  },
});
