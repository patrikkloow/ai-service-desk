import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  appendConversationMessage,
  getAvailableConversation,
} from "./conversations";
import {
  MAX_CONTEXT_MESSAGE_CHARS,
  MAX_CONTEXT_MESSAGES,
} from "./orchestratorCore";
import { getTenantConfiguration } from "./configuration";

export const loadConversationContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) throw new Error("Conversation is unavailable");

    const newestFirst = await ctx.db
      .query("conversationMessages")
      .withIndex("by_organizationId_and_conversationId_and_createdAt", (q) =>
        q
          .eq("organizationId", conversation.organizationId)
          .eq("conversationId", conversation._id),
      )
      .order("desc")
      .take(MAX_CONTEXT_MESSAGES);
    const [policy, profile] = await Promise.all([
      getTenantConfiguration(ctx, "aiPolicies", conversation.organizationId),
      getTenantConfiguration(
        ctx,
        "businessProfiles",
        conversation.organizationId,
      ),
    ]);

    return {
      conversation: {
        channel: conversation.channel,
        ...(conversation.subject !== undefined
          ? { subject: conversation.subject }
          : {}),
        customerLinked: conversation.customerId !== undefined,
      },
      messages: newestFirst.reverse().map((message) => ({
        senderType: message.senderType,
        content: message.content.slice(0, MAX_CONTEXT_MESSAGE_CHARS),
      })),
      actionPolicies: policy?.actions ?? null,
      responseStyle: policy
        ? {
            language:
              policy.responseLanguage === "business_default"
                ? profile?.defaultLanguage.toLowerCase().startsWith("en")
                  ? "english"
                  : "swedish"
                : policy.responseLanguage,
            tone: policy.communicationTone,
          }
        : null,
    };
  },
});

export const appendAiResponse = internalMutation({
  args: { conversationId: v.id("conversations"), content: v.string() },
  handler: async (ctx, args) => {
    const conversation = await getAvailableConversation(
      ctx,
      args.conversationId,
    );
    if (conversation === null) throw new Error("Conversation is unavailable");
    await appendConversationMessage(ctx, conversation, "ai", args.content);
  },
});
