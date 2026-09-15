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

describe("tenant-scoped knowledge retrieval", () => {
  test("returns only active current-tenant entries", async () => {
    const t = convexTest({ schema, modules: import.meta.glob("./**/*.*s") });
    const organizationA = t.withIdentity(
      clerkIdentity("user_a", "org_a", "admin"),
    );
    const organizationB = t.withIdentity(
      clerkIdentity("user_b", "org_b", "member"),
    );

    await organizationA.mutation(api.tenants.ensureCurrentTenant, {});
    await organizationB.mutation(api.tenants.ensureCurrentTenant, {});

    const openingHours = await organizationA.mutation(api.knowledge.create, {
      title: "Opening hours",
      content: "Our uniquehoursphrase is Monday through Friday from 08:00 to 17:00.",
    });
    await organizationA.mutation(api.knowledge.create, {
      title: "Billing guidance",
      content: "This entry also contains retrievalmarker for limit testing.",
    });
    await organizationA.mutation(api.knowledge.create, {
      title: "Contact guidance",
      content: "This entry also contains retrievalmarker for limit testing.",
    });

    expect(await organizationA.query(api.knowledge.list, {})).toHaveLength(3);
    expect(
      await organizationA.query(api.knowledge.get, { knowledgeId: openingHours }),
    ).toMatchObject({ title: "Opening hours", status: "active" });
    expect(
      await organizationA.query(api.knowledge.search, { query: "opening" }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ knowledgeId: openingHours }),
      ]),
    );
    expect(
      await organizationB.query(api.knowledge.search, {
        query: "uniquehoursphrase",
      }),
    ).toEqual([]);
    expect(
      await organizationA.query(api.knowledge.search, {
        query: "uniquehoursphrase",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ knowledgeId: openingHours }),
      ]),
    );
    expect(
      await organizationA.query(api.knowledge.search, { query: "unrelatedword" }),
    ).toEqual([]);
    expect(
      await organizationA.query(api.knowledge.search, { query: "   " }),
    ).toEqual([]);
    expect(
      await organizationA.query(api.knowledge.search, {
        query: "retrievalmarker",
        limit: 1,
      }),
    ).toHaveLength(1);

    await organizationA.mutation(api.knowledge.update, {
      knowledgeId: openingHours,
      title: "Updated opening hours",
    });
    expect(
      await organizationA.query(api.knowledge.get, { knowledgeId: openingHours }),
    ).toMatchObject({ title: "Updated opening hours" });
    await organizationA.mutation(api.knowledge.setStatus, {
      knowledgeId: openingHours,
      status: "inactive",
    });
    expect(
      await organizationA.query(api.knowledge.search, { query: "uniquehoursphrase" }),
    ).toEqual([]);

    expect(await organizationB.query(api.knowledge.list, {})).toEqual([]);
    expect(
      await organizationB.query(api.knowledge.get, { knowledgeId: openingHours }),
    ).toBeNull();
    await expect(
      organizationB.mutation(api.knowledge.update, {
        knowledgeId: openingHours,
        content: "Cross-tenant change",
      }),
    ).rejects.toThrow("Knowledge entry is unavailable");
    await expect(
      organizationB.mutation(api.knowledge.setStatus, {
        knowledgeId: openingHours,
        status: "active",
      }),
    ).rejects.toThrow("Knowledge entry is unavailable");
  });
});
