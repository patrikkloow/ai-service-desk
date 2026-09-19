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
    await expect(memberA.mutation(api.services.remove, { serviceId: unused, scopeToken: "" }))
      .rejects.toThrow("Organization administrator access is required");
    await expect(adminB.mutation(api.services.remove, { serviceId: unused, scopeToken: "" }))
      .rejects.toThrow("Service is unavailable");
    const unusedImpact = await adminA.query(api.services.deletionImpact, { serviceId: unused });
    await adminA.mutation(api.services.remove, { serviceId: unused, scopeToken: unusedImpact.scopeToken });
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
    const activeImpact = await adminA.query(api.services.deletionImpact, { serviceId: booked });
    await expect(adminA.mutation(api.services.remove, { serviceId: booked, scopeToken: activeImpact.scopeToken }))
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
    const historyImpact = await adminA.query(api.services.deletionImpact, { serviceId: booked });
    await adminA.mutation(api.services.remove, { serviceId: booked, scopeToken: historyImpact.scopeToken });
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
    const requestImpact = await adminA.query(api.services.deletionImpact, { serviceId: requested });
    expect(requestImpact.requestCount).toBe(1);
    await adminA.mutation(api.services.remove, {
      serviceId: requested,
      scopeToken: requestImpact.scopeToken,
    });
    expect(await t.run((ctx) => ctx.db.get(requestId))).toMatchObject({
      status: "new",
      serviceName: "Förfrågad tjänst",
    });
    expect((await t.run((ctx) => ctx.db.get(requestId)))?.serviceId).toBeUndefined();

    const linked = await adminA.mutation(api.services.create, { name: "Resurskopplad tjänst" });
    const resourceId = await adminA.mutation(api.resources.create, { name: "Resurs", kind: "person" });
    await adminA.mutation(api.resources.setServices, { resourceId, serviceIds: [linked] });
    const linkedImpact = await adminA.query(api.services.deletionImpact, { serviceId: linked });
    expect(linkedImpact.resourceLinkCount).toBe(1);
    await adminA.mutation(api.services.remove, {
      serviceId: linked,
      scopeToken: linkedImpact.scopeToken,
    });
    expect(await adminA.query(api.services.get, { serviceId: linked })).toBeNull();
    expect(await adminA.query(api.resources.list, { includeInactive: true })).toMatchObject({
      resources: [
        expect.objectContaining({
          _id: resourceId,
          serviceRestrictionMode: "selected",
          serviceIds: [],
        }),
      ],
    });

    const changing = await adminA.mutation(api.services.create, { name: "Ändrad omfattning" });
    const beforeChange = await adminA.query(api.services.deletionImpact, { serviceId: changing });
    const changedRequest = await adminA.mutation(api.serviceRequests.create, {
      title: "Ny relation",
      summary: { wants: "Hjälp", known: "", missing: "" },
      serviceId: changing,
    });
    await expect(
      adminA.mutation(api.services.remove, {
        serviceId: changing,
        scopeToken: beforeChange.scopeToken,
      }),
    ).rejects.toThrow("SERVICE_DELETE_SCOPE_CHANGED");
    expect(await adminA.query(api.services.get, { serviceId: changing })).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(changedRequest))).toMatchObject({
      serviceId: changing,
    });
  });
});
