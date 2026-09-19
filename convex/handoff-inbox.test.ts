/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { parseModelToolRequest } from "./orchestratorCore";
import { TEST_OPEN_WEEK } from "./testBookingSchedule";

const summary = {
  wants: "Boka en bedömning",
  known: "Kunden önskar en tid nästa vecka",
  missing: "Önskad dag",
};
const identity = (user: string, org = "a") => ({
  subject: user,
  tokenIdentifier: `https://clerk.test|${user}`,
  o: { id: org, rol: "member" },
});
async function setup() {
  const t = convexTest({ schema, modules: import.meta.glob("./**/*.*s") });
  const a = t.withIdentity(identity("alice"));
  const b = t.withIdentity(identity("bob", "b"));
  const colleague = t.withIdentity(identity("colleague"));
  const tenant = await a.mutation(api.tenants.ensureCurrentTenant, {});
  await b.mutation(api.tenants.ensureCurrentTenant, {});
  for (const [org, name] of [
    ["a", "Resource A"],
    ["b", "Resource B"],
  ] as const) {
    const admin = t.withIdentity({
      ...identity(`admin_${org}`, org),
      o: { id: org, rol: "admin" },
    });
    await admin.mutation(api.businessHours.update, { schedule: TEST_OPEN_WEEK });
    const resourceId = await admin.mutation(api.resources.create, {
      name,
      kind: "person",
    });
    await admin.mutation(api.resources.updateSchedule, {
      resourceId,
      schedule: TEST_OPEN_WEEK,
    });
  }
  return { t, a, b, colleague, tenant };
}

describe("Service Request handoff and Inbox", () => {
  test("derives authority and rejects foreign references on every new boundary", async () => {
    const { t, a, b, tenant } = await setup();
    const id = await a.mutation(api.serviceRequests.create, {
      title: "Bedömning",
      summary,
    });
    expect(await b.query(api.inbox.list, { view: "attention" })).toMatchObject({
      items: [],
    });
    await expect(
      b.query(api.serviceRequests.get, { requestId: id }),
    ).rejects.toThrow("unavailable");
    await expect(b.query(api.inbox.detail, { target: id })).rejects.toThrow(
      "unavailable",
    );
    await expect(
      b.mutation(api.serviceRequests.update, {
        requestId: id,
        title: "Attack",
      }),
    ).rejects.toThrow("unavailable");
    for (const action of ["request", "acknowledge", "resolve"] as const)
      await expect(
        b.mutation(api.serviceRequests.attention, {
          target: id,
          action,
          reason: "test",
        }),
      ).rejects.toThrow("unavailable");
    const customer = await b.mutation(api.customers.create, {
      name: "Foreign",
    });
    const service = await b.mutation(api.services.create, { name: "Foreign" });
    const conversation = await b.mutation(api.conversations.create, {
      channel: "web",
    });
    const caseId = await b.mutation(api.cases.create, { title: "Foreign" });
    for (const ref of [
      { customerId: customer },
      { serviceId: service },
      { initialConversationId: conversation },
    ])
      await expect(
        a.mutation(api.serviceRequests.create, {
          title: "No",
          summary,
          ...ref,
        }),
      ).rejects.toThrow("unavailable");
    await expect(
      a.mutation(api.serviceRequests.linkCase, { requestId: id, caseId }),
    ).rejects.toThrow("unavailable");
    await expect(
      a.mutation(api.serviceRequests.attention, {
        target: caseId,
        action: "resolve",
      }),
    ).rejects.toThrow("unavailable");
    await expect(t.query(api.inbox.list, { view: "all" })).rejects.toThrow(
      "Not authenticated",
    );
    await expect(
      a.mutation(api.serviceRequests.create, {
        title: "No",
        summary,
        organizationId: tenant.organizationId,
      } as never),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.serviceRequests.attention, {
        target: id,
        action: "acknowledge",
        userId: "spoof",
      } as never),
    ).rejects.toThrow();
    await t.run(async (ctx) => {
      await ctx.db.patch(tenant.organizationId, { status: "suspended" });
    });
    await expect(a.query(api.inbox.list, { view: "all" })).rejects.toThrow(
      "unavailable",
    );
  });

  test("keeps lifecycle separate, records verified ownership, and hides resolved attention", async () => {
    const { t, a, colleague } = await setup();
    const id = await a.mutation(api.serviceRequests.create, {
      title: "Förfrågan",
      summary,
    });
    await expect(
      a.mutation(api.serviceRequests.update, {
        requestId: id,
        status: "completed",
      }),
    ).rejects.toThrow("Resolve attention");
    await a.mutation(api.serviceRequests.attention, {
      target: id,
      action: "acknowledge",
    });
    await expect(
      colleague.mutation(api.serviceRequests.attention, {
        target: id,
        action: "acknowledge",
      }),
    ).rejects.toThrow("another colleague");
    expect(await a.query(api.inbox.detail, { target: id })).toMatchObject({
      attention: "acknowledged",
      ownership: "mine",
      summary,
      done: [],
    });
    expect(
      await colleague.query(api.inbox.detail, { target: id }),
    ).toMatchObject({ ownership: "colleague" });
    await a.mutation(api.serviceRequests.attention, {
      target: id,
      action: "resolve",
    });
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items,
    ).toHaveLength(0);
    expect((await a.query(api.inbox.list, { view: "all" })).items).toHaveLength(
      1,
    );
    expect(
      await a.query(api.serviceRequests.get, { requestId: id }),
    ).toMatchObject({ status: "new", attention: "resolved" });
    await expect(
      a.mutation(api.serviceRequests.attention, {
        target: id,
        action: "acknowledge",
      }),
    ).rejects.toThrow("No active attention");
    await a.mutation(api.serviceRequests.update, {
      requestId: id,
      status: "completed",
    });
    await expect(
      a.mutation(api.serviceRequests.update, { requestId: id, status: "new" }),
    ).rejects.toThrow("Reopen");
    await a.mutation(api.serviceRequests.update, {
      requestId: id,
      status: "active",
      nextAction: "ask_customer",
    });
    await a.mutation(api.serviceRequests.attention, {
      target: id,
      action: "request",
      reason: "Ny fråga",
    });
    const events = await t.run((ctx) => ctx.db.query("workEvents").collect());
    expect(events.every((e) => e.actor === "https://clerk.test|alice")).toBe(
      true,
    );
    expect(JSON.stringify(events)).not.toContain(summary.wants);
  });

  test("repeated escalation preserves the request, acknowledgment and existing Case contract", async () => {
    const { a } = await setup();
    const conversationId = await a.mutation(api.conversations.create, {
      channel: "web",
    });
    const requestId = await a.mutation(api.serviceRequests.create, {
      title: "Arbete",
      summary,
      initialConversationId: conversationId,
    });
    const escalate = (reason = "Behöver hjälp") =>
      a.mutation(api.tools.executeWrite, {
        request: {
          toolName: "human.escalate",
          args: { conversationId, reason },
        },
      });
    expect(await escalate()).toMatchObject({
      ok: true,
      data: { created: true },
    });
    await a.mutation(api.serviceRequests.attention, {
      target: requestId,
      action: "acknowledge",
    });
    expect(await escalate("Ny information")).toMatchObject({
      ok: true,
      data: { created: false },
    });
    expect(await a.query(api.serviceRequests.get, { requestId })).toMatchObject(
      { attention: "acknowledged", attentionReason: "Ny information" },
    );
    const cases = await a.query(api.cases.listForConversation, {
      conversationId,
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].serviceRequestId).toBe(requestId);
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items.map(
        (i) => i.id,
      ),
    ).toEqual([requestId]);
    await a.mutation(api.cases.update, {
      caseId: cases[0]._id,
      title: "Updated",
    });
    expect(
      await a.query(api.cases.get, { caseId: cases[0]._id }),
    ).toMatchObject({ serviceRequestId: requestId });
    await a.mutation(api.serviceRequests.attention, {
      target: requestId,
      action: "resolve",
    });
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items,
    ).toHaveLength(0);
    expect(await escalate()).toMatchObject({
      ok: true,
      data: { created: false },
    });
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items,
    ).toHaveLength(1);
    expect(
      await a.query(api.conversations.get, { conversationId }),
    ).toMatchObject({ status: "open" });
    expect(await escalate(" ")).toMatchObject({ ok: false });
    expect(
      parseModelToolRequest({
        toolName: "human.escalate",
        args: { reason: "help", requestId },
      }),
    ).toMatchObject({ ok: false });
    await expect(
      a.mutation(api.tools.executeWrite, {
        request: {
          toolName: "human.escalate",
          args: { conversationId, reason: "help", organizationId: "spoof" },
        },
      } as never),
    ).rejects.toThrow();
  });

  test("continues an existing escalation as a request and supports standalone Cases", async () => {
    const { a } = await setup();
    const conversationId = await a.mutation(api.conversations.create, {
      channel: "email",
    });
    await a.mutation(api.tools.executeWrite, {
      request: {
        toolName: "human.escalate",
        args: { conversationId, reason: "Need a visit" },
      },
    });
    const requestId = await a.mutation(api.serviceRequests.create, {
      title: "Besök",
      summary,
      initialConversationId: conversationId,
    });
    await expect(
      a.mutation(api.serviceRequests.create, {
        title: "Duplicate",
        summary,
        initialConversationId: conversationId,
      }),
    ).rejects.toThrow("already has");
    expect(
      (await a.query(api.inbox.detail, { target: requestId })).cases,
    ).toHaveLength(1);
    const caseId = await a.mutation(api.cases.create, {
      title: "Invoice dispute",
    });
    await a.mutation(api.serviceRequests.attention, {
      target: caseId,
      action: "acknowledge",
    });
    expect(await a.query(api.inbox.detail, { target: caseId })).toMatchObject({
      ownership: "mine",
    });
    await a.mutation(api.cases.update, { caseId, title: "Invoice question" });
    expect(await a.query(api.inbox.detail, { target: caseId })).toMatchObject({
      ownership: "mine",
    });
    await a.mutation(api.serviceRequests.attention, {
      target: caseId,
      action: "resolve",
    });
    await a.mutation(api.cases.reopen, { caseId });
    expect(await a.query(api.inbox.detail, { target: caseId })).toMatchObject({
      ownership: "unassigned",
    });
    await a.mutation(api.serviceRequests.linkCase, { requestId, caseId });
    await expect(
      a.mutation(api.serviceRequests.attention, {
        target: caseId,
        action: "resolve",
      }),
    ).rejects.toThrow("linked request");
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items,
    ).toHaveLength(1);
    await a.mutation(api.cases.resolve, { caseId });
    await a.mutation(api.serviceRequests.attention, {
      target: requestId,
      action: "resolve",
    });
    await a.mutation(api.cases.reopen, { caseId });
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items,
    ).toHaveLength(1);
  });

  test("orders requested work before acknowledged work, then by recency", async () => {
    const { t, a } = await setup();
    const first = await a.mutation(api.serviceRequests.create, {
      title: "First",
      summary,
    });
    const second = await a.mutation(api.serviceRequests.create, {
      title: "Second",
      summary,
    });
    const ack = await a.mutation(api.serviceRequests.create, {
      title: "Acknowledged",
      summary,
    });
    await a.mutation(api.serviceRequests.attention, {
      target: ack,
      action: "acknowledge",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(first, { updatedAt: 10 });
      await ctx.db.patch(second, { updatedAt: 20 });
      await ctx.db.patch(ack, { updatedAt: 30 });
    });
    expect(
      (await a.query(api.inbox.list, { view: "attention" })).items.map(
        (i) => i.id,
      ),
    ).toEqual([second, first, ack]);
  });

  test("validates bookings and structured fields without fabricating summary facts", async () => {
    const { a, b } = await setup();
    const customerId = await a.mutation(api.customers.create, { name: "Kund" });
    const serviceId = await a.mutation(api.services.create, { name: "Besök" });
    const requestId = await a.mutation(api.serviceRequests.create, {
      title: "Besök",
      summary,
      customerId,
      serviceId,
    });
    await expect(
      a.mutation(api.serviceRequests.update, {
        requestId,
        status: "scheduled",
      }),
    ).rejects.toThrow("confirmed booking");
    const bookingId = await a.mutation(api.bookings.create, {
      customerId,
      serviceId,
      startTime: 60000,
      endTime: 120000,
    });
    await a.mutation(api.serviceRequests.update, {
      requestId,
      bookingId,
      status: "scheduled",
    });
    expect(
      (await a.query(api.inbox.detail, { target: requestId })).bookings,
    ).toHaveLength(1);
    const foreignRequest = await b.mutation(api.serviceRequests.create, {
      title: "Other",
      summary,
    });
    await expect(
      b.mutation(api.serviceRequests.update, {
        requestId: foreignRequest,
        bookingId,
      }),
    ).rejects.toThrow("unavailable");
    const otherCustomer = await a.mutation(api.customers.create, {
      name: "Other",
    });
    const otherRequest = await a.mutation(api.serviceRequests.create, {
      title: "Other",
      summary,
      customerId: otherCustomer,
    });
    await expect(
      a.mutation(api.serviceRequests.update, {
        requestId: otherRequest,
        bookingId,
      }),
    ).rejects.toThrow("customer must match");
    await expect(
      a.mutation(api.serviceRequests.create, { title: " ", summary }),
    ).rejects.toThrow("invalid");
    await expect(
      a.mutation(api.serviceRequests.update, {
        requestId,
        summary: { ...summary, known: "x".repeat(1001) },
      }),
    ).rejects.toThrow("invalid");
    const detail = await a.query(api.inbox.detail, { target: requestId });
    expect(detail.done).toEqual([]);
    expect(detail.summary).toEqual(summary);
  });
});

test("customer links remain consistent and an explicit Case link continues escalation", async () => {
  const { a, b } = await setup();
  const conversationId = await a.mutation(api.conversations.create, {
    channel: "web",
  });
  const requestId = await a.mutation(api.serviceRequests.create, {
    title: "Work",
    summary,
    initialConversationId: conversationId,
  });
  const customerId = await a.mutation(api.customers.create, {
    name: "Customer",
  });
  await a.mutation(api.conversations.linkCustomer, {
    conversationId,
    customerId,
  });
  expect(await a.query(api.serviceRequests.get, { requestId })).toMatchObject({
    customerId,
  });
  const otherCustomer = await a.mutation(api.customers.create, {
    name: "Other",
  });
  await expect(
    a.mutation(api.conversations.linkCustomer, {
      conversationId,
      customerId: otherCustomer,
    }),
  ).rejects.toThrow("match linked request");
  const foreignService = await b.mutation(api.services.create, {
    name: "Foreign",
  });
  await expect(
    a.mutation(api.serviceRequests.update, {
      requestId,
      serviceId: foreignService,
    }),
  ).rejects.toThrow("unavailable");
  const otherConversation = await a.mutation(api.conversations.create, {
    channel: "email",
  });
  await a.mutation(api.tools.executeWrite, {
    request: {
      toolName: "human.escalate",
      args: { conversationId: otherConversation, reason: "Help" },
    },
  });
  const [record] = await a.query(api.cases.listForConversation, {
    conversationId: otherConversation,
  });
  const otherRequest = await a.mutation(api.serviceRequests.create, {
    title: "Other",
    summary,
  });
  await a.mutation(api.serviceRequests.linkCase, {
    requestId: otherRequest,
    caseId: record._id,
  });
  await a.mutation(api.serviceRequests.attention, {
    target: otherRequest,
    action: "resolve",
  });
  await a.mutation(api.tools.executeWrite, {
    request: {
      toolName: "human.escalate",
      args: { conversationId: otherConversation, reason: "Help again" },
    },
  });
  expect(
    await a.query(api.serviceRequests.get, { requestId: otherRequest }),
  ).toMatchObject({
    attention: "requested",
    attentionReason: "Help again",
    initialConversationId: otherConversation,
  });
});
