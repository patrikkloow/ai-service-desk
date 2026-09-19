/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const WORK_WEEK = {
  monday: [{ start: "09:00", end: "17:00" }],
  tuesday: [{ start: "09:00", end: "17:00" }],
  wednesday: [{ start: "09:00", end: "17:00" }],
  thursday: [{ start: "09:00", end: "17:00" }],
  friday: [{ start: "09:00", end: "17:00" }],
  saturday: [],
  sunday: [],
};

function identity(
  user: string,
  organization: string,
  role: "admin" | "member",
) {
  return {
    subject: user,
    tokenIdentifier: `https://clerk.test|${user}`,
    o: { id: organization, rol: role },
  };
}

async function setup() {
  const t = convexTest({ schema, modules: import.meta.glob("./**/*.*s") });
  const admin = t.withIdentity(identity("admin_a", "org_a", "admin"));
  const member = t.withIdentity(identity("member_a", "org_a", "member"));
  const foreignAdmin = t.withIdentity(identity("admin_b", "org_b", "admin"));
  await admin.mutation(api.tenants.ensureCurrentTenant, {});
  await member.mutation(api.tenants.ensureCurrentTenant, {});
  await foreignAdmin.mutation(api.tenants.ensureCurrentTenant, {});
  await admin.mutation(api.businessHours.update, { schedule: WORK_WEEK });
  await foreignAdmin.mutation(api.businessHours.update, { schedule: WORK_WEEK });
  const customer = await admin.mutation(api.customers.create, {
    name: "Testkund",
  });
  const service = await admin.mutation(api.services.create, {
    name: "Rådgivning",
    durationMinutes: 60,
  });
  const resourceA = await admin.mutation(api.resources.create, {
    name: "Anna",
    kind: "person",
  });
  const resourceB = await admin.mutation(api.resources.create, {
    name: "Rum 2",
    kind: "room",
  });
  for (const resourceId of [resourceA, resourceB]) {
    await admin.mutation(api.resources.updateSchedule, {
      resourceId,
      schedule: WORK_WEEK,
    });
  }
  const foreignResource = await foreignAdmin.mutation(api.resources.create, {
    name: "Tenant B",
    kind: "person",
  });
  await foreignAdmin.mutation(api.resources.updateSchedule, {
    resourceId: foreignResource,
    schedule: WORK_WEEK,
  });
  return {
    t,
    admin,
    member,
    foreignAdmin,
    customer,
    service,
    resourceA,
    resourceB,
    foreignResource,
  };
}

const mondayTen = Date.parse("2033-05-16T08:00:00Z");
const hour = 60 * 60 * 1000;

describe("booking system v1", () => {
  test("members book while resource administration and tenants remain isolated", async () => {
    const { admin, member, customer, service, resourceA, foreignResource } =
      await setup();
    const bookingId = await member.mutation(api.calendarBookings.create, {
      idempotencyKey: "member-booking-0001",
      customer: { kind: "existing", customerId: customer },
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
    expect(await member.query(api.bookings.get, { bookingId })).toMatchObject({
      resourceId: resourceA,
      resourceName: "Anna",
      status: "confirmed",
    });
    await expect(
      member.mutation(api.resources.update, {
        resourceId: resourceA,
        status: "inactive",
      }),
    ).rejects.toThrow("Organization administrator access is required");
    await expect(
      admin.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: service,
        resourceId: foreignResource,
        startTime: mondayTen + hour,
        endTime: mondayTen + 2 * hour,
      }),
    ).rejects.toThrow("resource_unavailable");
  });

  test("capacity, service restrictions, schedules, blocks, inactivity and back-to-back rules are shared", async () => {
    const { admin, customer, service, resourceA, resourceB } = await setup();
    const otherService = await admin.mutation(api.services.create, {
      name: "Annat arbete",
      durationMinutes: 60,
    });
    await admin.mutation(api.resources.setServices, {
      resourceId: resourceA,
      serviceIds: [service],
    });
    await admin.mutation(api.resources.setServices, {
      resourceId: resourceB,
      serviceIds: [otherService],
    });
    await admin.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
    await expect(
      admin.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: service,
        resourceId: resourceA,
        startTime: mondayTen + 30 * 60_000,
        endTime: mondayTen + 90 * 60_000,
      }),
    ).rejects.toThrow("booking_conflict");
    await admin.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen + hour,
      endTime: mondayTen + 2 * hour,
    });
    await expect(
      admin.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: service,
        resourceId: resourceB,
        startTime: mondayTen,
        endTime: mondayTen + hour,
      }),
    ).rejects.toThrow("service_not_supported");
    await admin.mutation(api.resources.createBlock, {
      resourceId: resourceB,
      startTime: mondayTen + 2 * hour,
      endTime: mondayTen + 3 * hour,
      note: "Internt möte",
    });
    expect(
      await admin.query(api.resources.listBlocks, {
        resourceId: resourceB,
        startTime: mondayTen - 180 * 24 * hour,
        endTime: mondayTen + 180 * 24 * hour,
      }),
    ).toHaveLength(1);
    await expect(
      admin.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: otherService,
        resourceId: resourceB,
        startTime: mondayTen + 2 * hour,
        endTime: mondayTen + 3 * hour,
      }),
    ).rejects.toThrow("blocked");
    await expect(
      admin.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: otherService,
        resourceId: resourceB,
        startTime: mondayTen - 2 * hour,
        endTime: mondayTen - hour,
      }),
    ).rejects.toThrow("outside_business_hours");
    await admin.mutation(api.resources.update, {
      resourceId: resourceB,
      status: "inactive",
    });
    await expect(
      admin.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: otherService,
        resourceId: resourceB,
        startTime: mondayTen + 3 * hour,
        endTime: mondayTen + 4 * hour,
      }),
    ).rejects.toThrow("resource_unavailable");
  });

  test("reschedule ignores itself, rejects conflicts, and staff booking ignores AI policy", async () => {
    const { admin, member, customer, service, resourceA, resourceB } =
      await setup();
    await admin.mutation(api.aiPolicy.update, {
      actions: {
        bookingCreate: "human",
        bookingReschedule: "confirm",
        bookingCancel: "confirm",
        caseCreate: "allow",
      },
      responseLanguage: "swedish",
      communicationTone: "neutral",
    });
    const first = await member.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
    const second = await admin.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceB,
      startTime: mondayTen + hour,
      endTime: mondayTen + 2 * hour,
    });
    await admin.mutation(api.bookings.reschedule, {
      bookingId: first,
      resourceId: resourceA,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
    await expect(
      admin.mutation(api.bookings.reschedule, {
        bookingId: second,
        resourceId: resourceA,
        startTime: mondayTen + 30 * 60_000,
        endTime: mondayTen + 90 * 60_000,
      }),
    ).rejects.toThrow("booking_conflict");
  });

  test("legacy bookings block all resources until staff assigns one explicitly", async () => {
    const { t, admin, customer, service, resourceA, resourceB } = await setup();
    const organizationId = (
      await admin.mutation(api.tenants.ensureCurrentTenant, {})
    ).organizationId;
    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("bookings", {
        organizationId,
        customerId: customer,
        serviceId: service,
        customerName: "Äldre kund",
        serviceName: "Äldre tjänst",
        servicePricing: { kind: "not_specified" },
        startTime: mondayTen,
        endTime: mondayTen + hour,
        status: "confirmed",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    for (const resourceId of [resourceA, resourceB]) {
      await expect(
        admin.mutation(api.bookings.create, {
          customerId: customer,
          serviceId: service,
          resourceId,
          startTime: mondayTen,
          endTime: mondayTen + hour,
        }),
      ).rejects.toThrow("booking_conflict");
    }
    await admin.mutation(api.calendarBookings.assignLegacyResource, {
      bookingId: legacyId,
      resourceId: resourceA,
    });
    await admin.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceB,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
  });

  test("idempotent create avoids duplicate customers and preserves linked request lifecycle", async () => {
    const { t, admin, service, resourceA } = await setup();
    const organizationId = (
      await admin.mutation(api.tenants.ensureCurrentTenant, {})
    ).organizationId;
    const newCustomerInput = {
      idempotencyKey: "new-customer-attempt-01",
      customer: {
        kind: "new" as const,
        name: "Ny syntetisk kund",
        email: "new@example.test",
      },
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen + 2 * hour,
      endTime: mondayTen + 3 * hour,
    };
    const newCustomerBooking = await admin.mutation(
      api.calendarBookings.create,
      newCustomerInput,
    );
    expect(
      await admin.mutation(api.calendarBookings.create, newCustomerInput),
    ).toBe(newCustomerBooking);
    expect(
      await t.run(async (ctx) =>
        (
          await ctx.db
            .query("customers")
            .withIndex("by_organizationId", (q) =>
              q.eq("organizationId", organizationId),
            )
            .collect()
        ).filter((customer) => customer.name === "Ny syntetisk kund"),
      ),
    ).toHaveLength(1);
    const requestCustomer = await admin.mutation(api.customers.create, {
      name: "Förfrågningskund",
    });
    const requestId = await admin.mutation(api.serviceRequests.create, {
      title: "Boka besök",
      summary: { wants: "Ett besök", known: "Måndag", missing: "" },
      customerId: requestCustomer,
      serviceId: service,
    });
    const input = {
      idempotencyKey: "stable-attempt-000001",
      customer: { kind: "existing" as const, customerId: requestCustomer },
      serviceId: service,
      resourceId: resourceA,
      serviceRequestId: requestId,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    };
    const first = await admin.mutation(api.calendarBookings.create, input);
    const retry = await admin.mutation(api.calendarBookings.create, input);
    expect(retry).toBe(first);
    await expect(
      admin.mutation(api.calendarBookings.create, {
        ...input,
        endTime: mondayTen + 2 * hour,
      }),
    ).rejects.toThrow("another booking");
    expect(
      await admin.query(api.serviceRequests.get, { requestId }),
    ).toMatchObject({
      bookingId: first,
      status: "new",
    });
    await expect(
      admin.mutation(api.calendarBookings.create, {
        idempotencyKey: "conflicting-customer-01",
        customer: { kind: "new", name: "Ska rullas tillbaka" },
        serviceId: service,
        resourceId: resourceA,
        startTime: mondayTen,
        endTime: mondayTen + hour,
      }),
    ).rejects.toThrow("booking_conflict");
    expect(
      await t.run(async (ctx) =>
        (
          await ctx.db
            .query("customers")
            .withIndex("by_organizationId", (q) =>
              q.eq("organizationId", organizationId),
            )
            .collect()
        ).filter((customer) => customer.name === "Ska rullas tillbaka"),
      ),
    ).toHaveLength(0);
  });

  test("staff schedule overrides require confirmation, are audited, and AI-domain paths remain strict", async () => {
    const { t, member, customer, service, resourceA } = await setup();
    const outsideStart = mondayTen - 2 * hour;
    const input = {
      idempotencyKey: "staff-override-000001",
      customer: { kind: "existing" as const, customerId: customer },
      serviceId: service,
      resourceId: resourceA,
      startTime: outsideStart,
      endTime: outsideStart + hour,
    };
    await expect(
      member.mutation(api.calendarBookings.create, input),
    ).rejects.toThrow("SCHEDULE_OVERRIDE_REQUIRED");
    await expect(
      member.mutation(api.bookings.create, {
        customerId: customer,
        serviceId: service,
        resourceId: resourceA,
        startTime: outsideStart,
        endTime: outsideStart + hour,
      }),
    ).rejects.toThrow("outside_business_hours");
    const bookingId = await member.mutation(api.calendarBookings.create, {
      ...input,
      confirmScheduleOverride: true,
    });
    const created = await member.query(api.bookings.get, { bookingId });
    const earlier = outsideStart - hour;
    await expect(
      member.mutation(api.calendarBookings.reschedule, {
        bookingId,
        resourceId: resourceA,
        startTime: earlier,
        endTime: earlier + hour,
        expectedUpdatedAt: created!.updatedAt,
      }),
    ).rejects.toThrow("SCHEDULE_OVERRIDE_REQUIRED");
    await member.mutation(api.calendarBookings.reschedule, {
      bookingId,
      resourceId: resourceA,
      startTime: earlier,
      endTime: earlier + hour,
      expectedUpdatedAt: created!.updatedAt,
      confirmScheduleOverride: true,
    });
    expect(await t.run((ctx) => ctx.db.query("bookingEvents").collect())).toEqual([
      expect.objectContaining({
        bookingId,
        resourceId: resourceA,
        action: "schedule_override_created",
        actor: "https://clerk.test|member_a",
      }),
      expect.objectContaining({
        bookingId,
        resourceId: resourceA,
        action: "schedule_override_rescheduled",
        actor: "https://clerk.test|member_a",
      }),
    ]);
  });

  test("calendar reschedule rejects stale writes", async () => {
    const { t, admin, customer, service, resourceA } = await setup();
    const bookingId = await admin.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
    const booking = await admin.query(api.bookings.get, { bookingId });
    await admin.mutation(api.calendarBookings.reschedule, {
      bookingId,
      resourceId: resourceA,
      startTime: mondayTen + hour,
      endTime: mondayTen + 2 * hour,
      expectedUpdatedAt: booking!.updatedAt,
    });
    const moved = await admin.query(api.bookings.get, { bookingId });
    expect(moved).toMatchObject({
      startTime: mondayTen + hour,
      endTime: mondayTen + 2 * hour,
      resourceId: resourceA,
    });
    await t.run((ctx) => ctx.db.patch(bookingId, { updatedAt: moved!.updatedAt + 1 }));
    await expect(
      admin.mutation(api.calendarBookings.reschedule, {
        bookingId,
        resourceId: resourceA,
        startTime: mondayTen + hour,
        endTime: mondayTen + 2 * hour,
        expectedUpdatedAt: moved!.updatedAt,
      }),
    ).rejects.toThrow("BOOKING_CHANGED");
  });

  test("a confirmed schedule override still rejects a stale booking version", async () => {
    const { t, admin, customer, service, resourceA } = await setup();
    const bookingId = await admin.mutation(api.bookings.create, {
      customerId: customer,
      serviceId: service,
      resourceId: resourceA,
      startTime: mondayTen,
      endTime: mondayTen + hour,
    });
    const booking = await admin.query(api.bookings.get, { bookingId });
    const outsideStart = mondayTen - 2 * hour;
    const intendedMove = {
      bookingId,
      resourceId: resourceA,
      startTime: outsideStart,
      endTime: outsideStart + hour,
      expectedUpdatedAt: booking!.updatedAt,
    };
    await expect(
      admin.mutation(api.calendarBookings.reschedule, intendedMove),
    ).rejects.toThrow("SCHEDULE_OVERRIDE_REQUIRED");
    await t.run((ctx) =>
      ctx.db.patch(bookingId, { updatedAt: booking!.updatedAt + 1 }),
    );
    await expect(
      admin.mutation(api.calendarBookings.reschedule, {
        ...intendedMove,
        confirmScheduleOverride: true,
      }),
    ).rejects.toThrow("BOOKING_CHANGED");
    expect(await admin.query(api.bookings.get, { bookingId })).toMatchObject({
      startTime: mondayTen,
      endTime: mondayTen + hour,
      updatedAt: booking!.updatedAt + 1,
    });
    expect(await t.run((ctx) => ctx.db.query("bookingEvents").collect())).toEqual([]);
  });

  test("bounded calendar ranges include leading overlaps and more than 100 records", async () => {
    const { t, admin, customer, service, resourceA } = await setup();
    const organizationId = (
      await admin.mutation(api.tenants.ensureCurrentTenant, {})
    ).organizationId;
    const rangeStart = mondayTen;
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        const startTime = rangeStart - 30 * 60_000 + index * 1_000;
        await ctx.db.insert("bookings", {
          organizationId,
          customerId: customer,
          serviceId: service,
          customerName: `Syntetisk kund ${index}`,
          serviceName: "Syntetisk tjänst",
          servicePricing: { kind: "not_specified" },
          resourceId: resourceA,
          resourceName: "Anna",
          startTime,
          endTime: rangeStart + 30 * 60_000 + index * 1_000,
          status: "cancelled",
          createdAt: index,
          updatedAt: index,
        });
      }
    });
    const records = await admin.query(api.calendarBookings.listRange, {
      startTime: rangeStart,
      endTime: rangeStart + 8 * 24 * hour,
      includeCancelled: true,
    });
    expect(records).toHaveLength(105);
    expect(records.every((booking) => booking.startTime < rangeStart)).toBe(
      true,
    );
    expect(
      await admin.query(api.calendarBookings.listRange, {
        startTime: rangeStart,
        endTime: rangeStart + 8 * 24 * hour,
      }),
    ).toHaveLength(0);
  });
});
