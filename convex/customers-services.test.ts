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
});
