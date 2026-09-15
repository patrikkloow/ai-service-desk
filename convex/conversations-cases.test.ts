/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

function clerkIdentity(
  userId: string,
  organizationId: string,
  role: "admin" | "member",
) {
  return {
    subject: userId,
    tokenIdentifier: `https://clerk.test|${userId}`,
    o: { id: organizationId, rol: role },
  };
}

describe("tenant-scoped conversations and cases", () => {
  test("supports lifecycle and prevents cross-tenant access", async () => {
    const t = convexTest({ schema, modules: import.meta.glob("./**/*.*s") });
    const organizationA = t.withIdentity(
      clerkIdentity("user_a", "org_a", "admin"),
    );
    const organizationB = t.withIdentity(
      clerkIdentity("user_b", "org_b", "member"),
    );

    await organizationA.mutation(api.tenants.ensureCurrentTenant, {});
    await organizationB.mutation(api.tenants.ensureCurrentTenant, {});
    const customerA = await organizationA.mutation(api.customers.create, {
      name: "Customer A",
    });
    const customerB = await organizationB.mutation(api.customers.create, {
      name: "Customer B",
    });

    const conversationA = await organizationA.mutation(api.conversations.create, {
      channel: "web",
      subject: "General question",
    });
    await organizationA.mutation(api.conversations.appendMessage, {
      conversationId: conversationA,
      senderType: "customer",
      content: "I need some help.",
    });
    await organizationA.mutation(api.conversations.appendMessage, {
      conversationId: conversationA,
      senderType: "human",
      content: "We will follow up.",
    });
    expect(
      await organizationA.query(api.conversations.listMessages, {
        conversationId: conversationA,
      }),
    ).toMatchObject([
      { senderType: "customer", content: "I need some help." },
      { senderType: "human", content: "We will follow up." },
    ]);

    await organizationA.mutation(api.conversations.linkCustomer, {
      conversationId: conversationA,
      customerId: customerA,
    });
    expect(
      await organizationA.query(api.conversations.get, {
        conversationId: conversationA,
      }),
    ).toMatchObject({ customerId: customerA, status: "open" });
    await organizationA.mutation(api.conversations.resolve, {
      conversationId: conversationA,
    });
    await organizationA.mutation(api.conversations.reopen, {
      conversationId: conversationA,
    });
    expect(
      await organizationA.query(api.conversations.listForCustomer, {
        customerId: customerA,
      }),
    ).toHaveLength(1);
    expect(
      await organizationA.query(api.conversations.listEvents, {
        conversationId: conversationA,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "conversation_created" }),
        expect.objectContaining({ type: "customer_linked" }),
        expect.objectContaining({ type: "resolved" }),
        expect.objectContaining({ type: "reopened" }),
      ]),
    );

    const linkedConversation = await organizationA.mutation(
      api.conversations.create,
      { channel: "email", customerId: customerA },
    );
    expect(
      await organizationA.query(api.conversations.list, { status: "open" }),
    ).toHaveLength(2);
    await expect(
      organizationA.mutation(api.conversations.create, {
        channel: "sms",
        customerId: customerB,
      }),
    ).rejects.toThrow("Customer is unavailable");

    const standaloneCase = await organizationA.mutation(api.cases.create, {
      title: "Standalone follow-up",
      priority: "low",
    });
    const conversationCase = await organizationA.mutation(api.cases.create, {
      conversationId: conversationA,
      title: "Conversation follow-up",
      description: "Needs attention.",
      priority: "high",
    });
    const customerCase = await organizationA.mutation(api.cases.create, {
      customerId: customerA,
      title: "Customer follow-up",
    });
    expect(
      await organizationA.query(api.cases.get, { caseId: conversationCase }),
    ).toMatchObject({
      conversationId: conversationA,
      customerId: customerA,
      priority: "high",
      status: "open",
    });
    expect(
      await organizationA.query(api.cases.listForConversation, {
        conversationId: conversationA,
      }),
    ).toHaveLength(1);
    expect(
      await organizationA.query(api.cases.listForCustomer, { customerId: customerA }),
    ).toHaveLength(2);
    await organizationA.mutation(api.cases.update, {
      caseId: standaloneCase,
      title: "Updated standalone follow-up",
      priority: "normal",
      description: "Updated details.",
    });
    await organizationA.mutation(api.cases.resolve, { caseId: conversationCase });
    await organizationA.mutation(api.cases.reopen, { caseId: conversationCase });
    expect(
      await organizationA.query(api.cases.get, { caseId: conversationCase }),
    ).toMatchObject({ status: "open" });
    expect(
      await organizationA.query(api.conversations.listEvents, {
        conversationId: conversationA,
      }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "case_created" })]),
    );

    expect(await organizationB.query(api.conversations.list, {})).toEqual([]);
    expect(
      await organizationB.query(api.conversations.get, {
        conversationId: conversationA,
      }),
    ).toBeNull();
    expect(
      await organizationB.query(api.conversations.listMessages, {
        conversationId: conversationA,
      }),
    ).toEqual([]);
    expect(
      await organizationB.query(api.conversations.listEvents, {
        conversationId: conversationA,
      }),
    ).toEqual([]);
    await expect(
      organizationB.mutation(api.conversations.linkCustomer, {
        conversationId: conversationA,
        customerId: customerB,
      }),
    ).rejects.toThrow("Conversation is unavailable");
    await expect(
      organizationA.mutation(api.conversations.linkCustomer, {
        conversationId: conversationA,
        customerId: customerB,
      }),
    ).rejects.toThrow("Customer is unavailable");
    await expect(
      organizationB.mutation(api.conversations.resolve, {
        conversationId: conversationA,
      }),
    ).rejects.toThrow("Conversation is unavailable");
    await expect(
      organizationB.mutation(api.conversations.appendMessage, {
        conversationId: conversationA,
        senderType: "human",
        content: "Cross-tenant message",
      }),
    ).rejects.toThrow("Conversation is unavailable");
    expect(await organizationB.query(api.cases.list, {})).toEqual([]);
    expect(
      await organizationB.query(api.cases.get, { caseId: conversationCase }),
    ).toBeNull();
    await expect(
      organizationB.mutation(api.cases.update, {
        caseId: conversationCase,
        title: "Cross-tenant change",
      }),
    ).rejects.toThrow("Case is unavailable");
    await expect(
      organizationB.mutation(api.cases.create, {
        conversationId: conversationA,
        title: "Cross-tenant conversation case",
      }),
    ).rejects.toThrow("Conversation is unavailable");
    await expect(
      organizationB.mutation(api.cases.create, {
        customerId: customerA,
        title: "Cross-tenant customer case",
      }),
    ).rejects.toThrow("Customer is unavailable");

    expect(linkedConversation).toBeDefined();
    expect(customerCase).toBeDefined();
  });
});
