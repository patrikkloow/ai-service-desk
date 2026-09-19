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
    o: {
      id: organizationId,
      rol: role,
    },
  };
}

describe("tenant-scoped customers and services", () => {
  test("isolates direct reads and writes between Clerk organizations", async () => {
    const t = convexTest({
      schema,
      modules: import.meta.glob("./**/*.*s"),
    });
    const organizationA = t.withIdentity(
      clerkIdentity("user_a", "org_a", "admin"),
    );
    const organizationB = t.withIdentity(
      clerkIdentity("user_b", "org_b", "member"),
    );

    await organizationA.mutation(api.tenants.ensureCurrentTenant, {});
    await organizationB.mutation(api.tenants.ensureCurrentTenant, {});

    const customerId = await organizationA.mutation(api.customers.create, {
      name: "Customer A",
      phone: "+46 70 000 00 00",
    });
    const serviceId = await organizationA.mutation(api.services.create, {
      name: "Consultation",
      pricing: {
        kind: "fixed",
        amountMinor: 9900,
        currency: "sek",
      },
    });

    expect(
      await organizationA.query(api.customers.list, { status: "active" }),
    ).toHaveLength(1);
    expect(
      await organizationA.query(api.services.list, { status: "active" }),
    ).toHaveLength(1);
    expect(
      await organizationB.query(api.customers.list, { status: "active" }),
    ).toEqual([]);
    expect(
      await organizationB.query(api.services.list, { status: "active" }),
    ).toEqual([]);
    expect(
      await organizationB.query(api.customers.get, { customerId }),
    ).toBeNull();
    expect(
      await organizationB.query(api.services.get, { serviceId }),
    ).toBeNull();

    await expect(
      organizationB.mutation(api.customers.update, {
        customerId,
        name: "Cross-tenant update",
      }),
    ).rejects.toThrow("Customer is unavailable");
    await expect(
      organizationB.mutation(api.services.setStatus, {
        serviceId,
        status: "inactive",
      }),
    ).rejects.toThrow("Service is unavailable");
    await expect(
      t.query(api.customers.list, { status: "active" }),
    ).rejects.toThrow("Not authenticated");

    expect(
      await organizationA.query(api.customers.get, { customerId }),
    ).toMatchObject({ name: "Customer A", status: "active" });
    expect(
      await organizationA.query(api.services.get, { serviceId }),
    ).toMatchObject({
      status: "active",
      pricing: { kind: "fixed", amountMinor: 9900, currency: "SEK" },
    });
  });

  test("permanent service deletion is admin-only, tenant-safe, and preserves terminal history", async () => {
    const t = convexTest({ schema, modules: import.meta.glob("./**/*.*s") });
    const adminA = t.withIdentity(clerkIdentity("admin_a", "org_a", "admin"));
    const memberA = t.withIdentity(clerkIdentity("member_a", "org_a", "member"));
    const adminB = t.withIdentity(clerkIdentity("admin_b", "org_b", "admin"));
    const tenantA = await adminA.mutation(api.tenants.ensureCurrentTenant, {});
    await memberA.mutation(api.tenants.ensureCurrentTenant, {});
    await adminB.mutation(api.tenants.ensureCurrentTenant, {});
    expect(await adminA.query(api.services.permissions, {})).toEqual({
      canDelete: true,
    });
    expect(await memberA.query(api.services.permissions, {})).toEqual({
      canDelete: false,
    });

    const unused = await adminA.mutation(api.services.create, { name: "Felskapad" });
    await expect(memberA.mutation(api.services.remove, { serviceId: unused }))
      .rejects.toThrow("Organization administrator access is required");
    await expect(adminB.mutation(api.services.remove, { serviceId: unused }))
      .rejects.toThrow("Service is unavailable");
    await adminA.mutation(api.services.remove, { serviceId: unused });
    expect(await adminA.query(api.services.get, { serviceId: unused })).toBeNull();

    const customerId = await adminA.mutation(api.customers.create, { name: "Historikkund" });
    const booked = await adminA.mutation(api.services.create, { name: "Bokad tjänst" });
    const activeBooking = await t.run((ctx) =>
      ctx.db.insert("bookings", {
        organizationId: tenantA.organizationId,
        customerId,
        serviceId: booked,
        customerName: "Historikkund",
        serviceName: "Bokad tjänst",
        servicePricing: { kind: "not_specified" },
        startTime: 1,
        endTime: 2,
        status: "confirmed",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await expect(adminA.mutation(api.services.remove, { serviceId: booked }))
      .rejects.toThrow("SERVICE_IN_USE");
    await t.run((ctx) => ctx.db.patch(activeBooking, { status: "completed" }));
    const cancelledBooking = await t.run((ctx) =>
      ctx.db.insert("bookings", {
        organizationId: tenantA.organizationId,
        customerId,
        serviceId: booked,
        customerName: "Historikkund",
        serviceName: "Bokad tjänst",
        servicePricing: { kind: "not_specified" },
        startTime: 3,
        endTime: 4,
        status: "cancelled",
        createdAt: 2,
        updatedAt: 2,
      }),
    );
    await adminA.mutation(api.services.remove, { serviceId: booked });
    expect(await adminA.query(api.services.get, { serviceId: booked })).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(activeBooking))).toMatchObject({
      status: "completed",
      serviceName: "Bokad tjänst",
    });
    expect(await t.run((ctx) => ctx.db.get(cancelledBooking))).toMatchObject({
      status: "cancelled",
      serviceName: "Bokad tjänst",
    });

    const requested = await adminA.mutation(api.services.create, { name: "Förfrågad tjänst" });
    const requestId = await adminA.mutation(api.serviceRequests.create, {
      title: "Historisk förfrågan",
      summary: { wants: "Hjälp", known: "", missing: "" },
      serviceId: requested,
    });
    await expect(adminA.mutation(api.services.remove, { serviceId: requested }))
      .rejects.toThrow("SERVICE_IN_USE");
    await t.run((ctx) => ctx.db.patch(requestId, { status: "completed" }));
    await expect(adminA.mutation(api.services.remove, { serviceId: requested }))
      .rejects.toThrow("SERVICE_IN_USE");
    expect(await t.run((ctx) => ctx.db.get(requestId))).toMatchObject({
      status: "completed",
      serviceId: requested,
    });

    const linked = await adminA.mutation(api.services.create, { name: "Resurskopplad tjänst" });
    const resourceId = await adminA.mutation(api.resources.create, { name: "Resurs", kind: "person" });
    await adminA.mutation(api.resources.setServices, { resourceId, serviceIds: [linked] });
    await expect(adminA.mutation(api.services.remove, { serviceId: linked }))
      .rejects.toThrow("SERVICE_IN_USE");
    expect(await adminA.query(api.services.get, { serviceId: linked })).not.toBeNull();
  });
});
