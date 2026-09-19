/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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

describe("tenant-scoped bookings and availability", () => {
  test("enforces overlap rules, history snapshots, and tenant isolation", async () => {
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
    const fourteen = 14 * 60 * 60 * 1000;
    const fifteen = 15 * 60 * 60 * 1000;

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
      name: "Customer A",
    });
    const serviceA = await organizationA.mutation(api.services.create, {
      name: "Consultation",
      pricing: { kind: "fixed", amountMinor: 9900, currency: "sek" },
    });
    const customerB = await organizationB.mutation(api.customers.create, {
      name: "Customer B",
    });
    const serviceB = await organizationB.mutation(api.services.create, {
      name: "Service B",
    });

    const bookingA = await organizationA.mutation(api.bookings.create, {
      customerId: customerA,
      serviceId: serviceA,
      startTime: ten,
      endTime: eleven,
    });

    for (const [startTime, endTime] of [
      [ten, eleven],
      [ten + 30 * 60 * 1000, eleven + 30 * 60 * 1000],
      [ten - 30 * 60 * 1000, ten + 30 * 60 * 1000],
      [ten - 30 * 60 * 1000, eleven + 30 * 60 * 1000],
    ]) {
      expect(
        await organizationA.query(api.availability.check, {
          startTime,
          endTime,
        }),
      ).toEqual({ available: false });
    }
    expect(
      await organizationA.query(api.availability.check, {
        startTime: ten - 60 * 60 * 1000,
        endTime: ten,
      }),
    ).toEqual({ available: true });
    expect(
      await organizationA.query(api.availability.check, {
        startTime: eleven,
        endTime: twelve,
      }),
    ).toEqual({ available: true });
    expect(
      await organizationB.query(api.availability.check, {
        startTime: ten,
        endTime: eleven,
      }),
    ).toEqual({ available: true });
    await expect(
      organizationA.mutation(api.bookings.create, {
        customerId: customerA,
        serviceId: serviceA,
        startTime: eleven,
        endTime: eleven,
      }),
    ).rejects.toThrow("End time must be after start time");

    await organizationA.mutation(api.customers.update, {
      customerId: customerA,
      name: "Renamed customer",
    });
    await organizationA.mutation(api.services.update, {
      serviceId: serviceA,
      name: "Renamed service",
      pricing: { kind: "from", amountMinor: 12_000, currency: "SEK" },
    });
    expect(
      await organizationA.query(api.bookings.get, { bookingId: bookingA }),
    ).toMatchObject({
      customerName: "Customer A",
      serviceName: "Consultation",
      servicePricing: { kind: "fixed", amountMinor: 9900, currency: "SEK" },
    });

    await organizationA.mutation(api.bookings.reschedule, {
      bookingId: bookingA,
      startTime: eleven,
      endTime: twelve,
    });
    const secondBooking = await organizationA.mutation(api.bookings.create, {
      customerId: customerA,
      serviceId: serviceA,
      startTime: twelve,
      endTime: thirteen,
    });
    await expect(
      organizationA.mutation(api.bookings.reschedule, {
        bookingId: bookingA,
        startTime: twelve + 30 * 60 * 1000,
        endTime: thirteen + 30 * 60 * 1000,
      }),
    ).rejects.toThrow("The requested time is unavailable");
    await organizationA.mutation(api.bookings.cancel, { bookingId: bookingA });
    expect(
      await organizationA.query(api.availability.check, {
        startTime: eleven,
        endTime: twelve,
      }),
    ).toEqual({ available: true });

    const completedBooking = await organizationA.mutation(api.bookings.create, {
      customerId: customerA,
      serviceId: serviceA,
      startTime: fourteen,
      endTime: fifteen,
    });
    await organizationA.mutation(api.bookings.complete, {
      bookingId: completedBooking,
    });
    expect(
      await organizationA.query(api.availability.check, {
        startTime: fourteen,
        endTime: fifteen,
      }),
    ).toEqual({ available: true });
    expect(await organizationA.query(api.bookings.list, {})).toHaveLength(3);

    expect(await organizationB.query(api.bookings.list, {})).toEqual([]);
    expect(
      await organizationB.query(api.bookings.get, { bookingId: secondBooking }),
    ).toBeNull();
    await expect(
      organizationB.mutation(api.bookings.reschedule, {
        bookingId: secondBooking,
        startTime: fourteen,
        endTime: fifteen,
      }),
    ).rejects.toThrow("Booking is unavailable");
    await expect(
      organizationB.mutation(api.bookings.create, {
        customerId: customerA,
        serviceId: serviceB,
        startTime: fourteen,
        endTime: fifteen,
      }),
    ).rejects.toThrow("Customer is unavailable");
    await expect(
      organizationA.mutation(api.bookings.create, {
        customerId: customerA,
        serviceId: serviceB,
        startTime: fourteen,
        endTime: fifteen,
      }),
    ).rejects.toThrow("Service is unavailable");
    await expect(
      organizationB.mutation(api.bookings.create, {
        customerId: customerB,
        serviceId: serviceA,
        startTime: fourteen,
        endTime: fifteen,
      }),
    ).rejects.toThrow("Service is unavailable");
  });
});
