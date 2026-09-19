/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { TEST_OPEN_WEEK } from "./testBookingSchedule";

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

function bookingIdFrom(result: unknown): Id<"bookings"> {
  const data = (
    result as { ok: boolean; data?: { bookingId?: Id<"bookings"> } }
  ).data;
  if (data?.bookingId === undefined)
    throw new Error("Expected a booking result");
  return data.bookingId;
}

function caseIdFrom(result: unknown): Id<"cases"> {
  const data = (result as { ok: boolean; data?: { caseId?: Id<"cases"> } })
    .data;
  if (data?.caseId === undefined) throw new Error("Expected a case result");
  return data.caseId;
}

describe("approved tenant-scoped tool layer", () => {
  test("uses an explicit allowlist, shared domain rules, safe provenance, and controlled errors", async () => {
    const t = convexTest({ schema, modules: import.meta.glob("./**/*.*s") });
    const organizationA = t.withIdentity(
      clerkIdentity("user_a", "org_a", "admin"),
    );
    const organizationB = t.withIdentity(
      clerkIdentity("user_b", "org_b", "member"),
    );
    const ten = 10 * 60 * 60 * 1000;
    const eleven = 11 * 60 * 60 * 1000;
    const twelve = 12 * 60 * 60 * 1000;
    const thirteen = 13 * 60 * 60 * 1000;

    await organizationA.mutation(api.tenants.ensureCurrentTenant, {});
    await organizationB.mutation(api.tenants.ensureCurrentTenant, {});
    const resourceA = await organizationA.mutation(api.resources.create, {
      name: "Resource A",
      kind: "person",
    });
    await organizationA.mutation(api.resources.updateSchedule, {
      resourceId: resourceA,
      schedule: TEST_OPEN_WEEK,
    });
    const organizationBAdmin = t.withIdentity(
      clerkIdentity("admin_b", "org_b", "admin"),
    );
    const resourceB = await organizationBAdmin.mutation(api.resources.create, {
      name: "Resource B",
      kind: "person",
    });
    await organizationBAdmin.mutation(api.resources.updateSchedule, {
      resourceId: resourceB,
      schedule: TEST_OPEN_WEEK,
    });

    const customerA = await organizationA.mutation(api.customers.create, {
      name: "Alex Andersson",
      email: "alex@example.com",
      phone: "+46 70 111 22 33",
      notes: "Do not expose this internal note.",
    });
    const serviceA = await organizationA.mutation(api.services.create, {
      name: "Consultation",
      durationMinutes: 60,
      pricing: { kind: "fixed", amountMinor: 9900, currency: "sek" },
    });
    const conversationA = await organizationA.mutation(
      api.conversations.create,
      {
        channel: "web",
        customerId: customerA,
        subject: "General support request",
      },
    );
    await organizationA.mutation(api.knowledge.create, {
      title: "Opening hours",
      content: "tooluniqueknowledge is available Monday through Friday.",
    });

    const customerB = await organizationB.mutation(api.customers.create, {
      name: "Bianca Berg",
      email: "bianca@example.com",
    });
    const serviceB = await organizationB.mutation(api.services.create, {
      name: "Service B",
    });
    const conversationB = await organizationB.mutation(
      api.conversations.create,
      {
        channel: "email",
        customerId: customerB,
        subject: "Organization B request",
      },
    );
    await organizationB.mutation(api.knowledge.create, {
      title: "Organization B knowledge",
      content: "organizationbuniqueknowledge only.",
    });

    const definitions = await organizationA.query(
      api.tools.listDefinitions,
      {},
    );
    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "knowledge.search", kind: "read" }),
        expect.objectContaining({ name: "booking.create", kind: "write" }),
        expect.objectContaining({ name: "human.escalate", kind: "write" }),
      ]),
    );

    const knowledgeResult = await organizationA.query(api.tools.executeRead, {
      request: {
        toolName: "knowledge.search",
        args: { query: "tooluniqueknowledge", limit: 5 },
      },
    });
    expect(knowledgeResult).toMatchObject({
      ok: true,
      data: {
        entries: [expect.objectContaining({ title: "Opening hours" })],
      },
    });

    const customerResult = await organizationA.query(api.tools.executeRead, {
      request: {
        toolName: "customer.find",
        args: { by: "email", value: "ALEX@EXAMPLE.COM" },
      },
    });
    expect(customerResult).toMatchObject({
      ok: true,
      data: {
        customers: [
          {
            customerId: customerA,
            name: "Alex Andersson",
            email: "alex@example.com",
          },
        ],
      },
    });
    expect(JSON.stringify(customerResult)).not.toContain("internal note");

    const servicesResult = await organizationA.query(api.tools.executeRead, {
      request: { toolName: "service.list", args: {} },
    });
    expect(servicesResult).toMatchObject({
      ok: true,
      data: {
        services: [
          expect.objectContaining({
            serviceId: serviceA,
            name: "Consultation",
            pricing: { kind: "fixed", amountMinor: 9900, currency: "SEK" },
          }),
        ],
      },
    });

    expect(
      await organizationA.query(api.tools.executeRead, {
        request: {
          toolName: "availability.check",
          args: { startTime: ten, endTime: eleven },
        },
      }),
    ).toEqual({ ok: true, data: { available: true, resourceId: resourceA } });

    const bookingResult = await organizationA.mutation(api.tools.executeWrite, {
      request: {
        toolName: "booking.create",
        args: {
          customerId: customerA,
          serviceId: serviceA,
          startTime: ten,
          endTime: eleven,
          conversationId: conversationA,
        },
      },
    });
    expect(bookingResult).toMatchObject({
      ok: true,
      data: { status: "confirmed", startTime: ten, endTime: eleven },
    });
    const bookingA = bookingIdFrom(bookingResult);
    expect(
      await organizationA.query(api.conversations.listEvents, {
        conversationId: conversationA,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "booking_created",
          entityType: "booking",
          entityId: bookingA,
        }),
      ]),
    );

    expect(
      await organizationB.query(api.tools.executeRead, {
        request: {
          toolName: "availability.check",
          args: { startTime: ten, endTime: eleven },
        },
      }),
    ).toEqual({ ok: true, data: { available: true, resourceId: resourceB } });

    const conflictResult = await organizationA.mutation(
      api.tools.executeWrite,
      {
        request: {
          toolName: "booking.create",
          args: {
            customerId: customerA,
            serviceId: serviceA,
            startTime: ten,
            endTime: eleven,
          },
        },
      },
    );
    expect(conflictResult).toEqual({
      ok: false,
      error: {
        code: "conflict",
        message: "The requested time is unavailable.",
      },
    });

    const rescheduleResult = await organizationA.mutation(
      api.tools.executeWrite,
      {
        request: {
          toolName: "booking.reschedule",
          args: {
            bookingId: bookingA,
            startTime: twelve,
            endTime: thirteen,
            conversationId: conversationA,
          },
        },
      },
    );
    expect(rescheduleResult).toMatchObject({
      ok: true,
      data: { bookingId: bookingA },
    });
    const cancelResult = await organizationA.mutation(api.tools.executeWrite, {
      request: {
        toolName: "booking.cancel",
        args: { bookingId: bookingA, conversationId: conversationA },
      },
    });
    expect(cancelResult).toEqual({
      ok: true,
      data: { bookingId: bookingA, status: "cancelled" },
    });
    expect(
      await organizationA.query(api.tools.executeRead, {
        request: {
          toolName: "availability.check",
          args: { startTime: twelve, endTime: thirteen },
        },
      }),
    ).toEqual({ ok: true, data: { available: true, resourceId: resourceA } });

    const caseResult = await organizationA.mutation(api.tools.executeWrite, {
      request: {
        toolName: "case.create",
        args: {
          conversationId: conversationA,
          title: "Follow-up needed",
          priority: "normal",
        },
      },
    });
    const caseA = caseIdFrom(caseResult);
    expect(
      await organizationA.query(api.cases.get, { caseId: caseA }),
    ).toMatchObject({ conversationId: conversationA, customerId: customerA });

    const escalation = await organizationA.mutation(api.tools.executeWrite, {
      request: {
        toolName: "human.escalate",
        args: {
          conversationId: conversationA,
          reason: "A person should follow up.",
        },
      },
    });
    expect(escalation).toMatchObject({
      ok: true,
      data: { created: true, status: "open" },
    });
    const escalationCase = caseIdFrom(escalation);
    const retryEscalation = await organizationA.mutation(
      api.tools.executeWrite,
      {
        request: {
          toolName: "human.escalate",
          args: {
            conversationId: conversationA,
            reason: "A person should follow up.",
          },
        },
      },
    );
    expect(retryEscalation).toEqual({
      ok: true,
      data: { caseId: escalationCase, status: "open", created: false },
    });
    expect(
      await organizationA.query(api.cases.get, { caseId: escalationCase }),
    ).toMatchObject({
      conversationId: conversationA,
      customerId: customerA,
      source: "human_escalation",
      status: "open",
    });
    expect(
      await organizationA.query(api.conversations.get, {
        conversationId: conversationA,
      }),
    ).toMatchObject({ status: "open" });
    expect(
      await organizationA.query(api.conversations.listEvents, {
        conversationId: conversationA,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "booking_rescheduled",
          entityType: "booking",
          entityId: bookingA,
        }),
        expect.objectContaining({
          type: "booking_cancelled",
          entityType: "booking",
          entityId: bookingA,
        }),
        expect.objectContaining({
          type: "case_created",
          entityType: "case",
          entityId: caseA,
        }),
        expect.objectContaining({
          type: "human_escalated",
          entityType: "case",
          entityId: escalationCase,
        }),
      ]),
    );

    expect(
      await organizationB.query(api.tools.executeRead, {
        request: { toolName: "service.list", args: {} },
      }),
    ).toMatchObject({
      ok: true,
      data: { services: [expect.objectContaining({ serviceId: serviceB })] },
    });
    expect(
      await organizationB.query(api.tools.executeRead, {
        request: {
          toolName: "customer.find",
          args: { by: "email", value: "alex@example.com" },
        },
      }),
    ).toEqual({ ok: true, data: { customers: [] } });
    expect(
      await organizationB.query(api.tools.executeRead, {
        request: {
          toolName: "knowledge.search",
          args: { query: "tooluniqueknowledge" },
        },
      }),
    ).toEqual({ ok: true, data: { entries: [] } });
    expect(
      await organizationB.query(api.tools.executeRead, {
        request: {
          toolName: "availability.check",
          args: { startTime: ten, endTime: eleven },
        },
      }),
    ).toEqual({ ok: true, data: { available: true, resourceId: resourceB } });

    for (const request of [
      {
        toolName: "booking.create" as const,
        args: {
          customerId: customerA,
          serviceId: serviceB,
          startTime: ten,
          endTime: eleven,
        },
      },
      {
        toolName: "booking.create" as const,
        args: {
          customerId: customerB,
          serviceId: serviceA,
          startTime: ten,
          endTime: eleven,
        },
      },
      {
        toolName: "booking.reschedule" as const,
        args: { bookingId: bookingA, startTime: ten, endTime: eleven },
      },
      { toolName: "booking.cancel" as const, args: { bookingId: bookingA } },
      {
        toolName: "case.create" as const,
        args: { conversationId: conversationA, title: "Cross-tenant case" },
      },
      {
        toolName: "human.escalate" as const,
        args: {
          conversationId: conversationA,
          reason: "Cross-tenant escalation",
        },
      },
      {
        toolName: "booking.create" as const,
        args: {
          customerId: customerB,
          serviceId: serviceB,
          startTime: ten,
          endTime: eleven,
          conversationId: conversationA,
        },
      },
    ]) {
      const result = await organizationB.mutation(api.tools.executeWrite, {
        request,
      });
      expect(result).toEqual({
        ok: false,
        error: {
          code: "unavailable",
          message: "The requested resource is unavailable.",
        },
      });
    }
    expect(
      await organizationB.query(api.conversations.listEvents, {
        conversationId: conversationA,
      }),
    ).toEqual([]);

    const invalidInterval = await organizationA.mutation(
      api.tools.executeWrite,
      {
        request: {
          toolName: "booking.create",
          args: {
            customerId: customerA,
            serviceId: serviceA,
            startTime: ten,
            endTime: ten,
          },
        },
      },
    );
    expect(invalidInterval).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "The tool request could not be completed.",
      },
    });
    await expect(
      organizationA.query(api.tools.executeRead, {
        request: { toolName: "database.query", args: {} } as never,
      }),
    ).rejects.toThrow();
    await expect(
      organizationA.mutation(api.tools.executeWrite, {
        request: {
          toolName: "booking.create",
          args: {
            customerId: customerA,
            serviceId: serviceA,
            startTime: ten,
            endTime: eleven,
            organizationId: "org_b",
            userId: "user_b",
            role: "org:admin",
          },
        } as never,
      }),
    ).rejects.toThrow();
    expect(
      await t.query(api.tools.executeRead, {
        request: { toolName: "service.list", args: {} },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "unauthorized",
        message: "A verified active workspace is required.",
      },
    });

    expect(conversationB).toBeDefined();
  });
});
