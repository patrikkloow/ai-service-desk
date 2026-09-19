// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { CoreDataConsole } from "./core-data-console";

const mock = vi.hoisted(() => ({
  canDelete: true,
  remove: vi.fn(),
  setStatus: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./tenant-bootstrap", () => ({
  useTenantProvisioning: () => ({ isReady: true, error: null }),
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "customers:list") return [];
    if (name === "services:permissions") return { canDelete: mock.canDelete };
    if (name === "services:list")
      return [
        {
          _id: "service-1",
          name: "Testtjänst",
          description: "Syntetisk tjänst",
          durationMinutes: 60,
          pricing: { kind: "fixed", amountMinor: 10000, currency: "SEK" },
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      ];
    throw new Error(`Unexpected query: ${name}`);
  },
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "services:remove") return mock.remove;
    if (name === "services:setStatus") return mock.setStatus;
    if (name === "services:create") return mock.create;
    if (name === "services:update") return mock.update;
    if (name.startsWith("customers:")) return vi.fn();
    throw new Error(`Unexpected mutation: ${name}`);
  },
}));

beforeEach(() => {
  mock.canDelete = true;
  mock.remove.mockReset().mockResolvedValue("service-1");
  mock.setStatus.mockReset().mockResolvedValue(undefined);
  mock.create.mockReset().mockResolvedValue("service-2");
  mock.update.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("service list deletion", () => {
  it("shows all admin actions in the wrapping row and opens confirmation", () => {
    render(<CoreDataConsole area="services" />);
    const edit = screen.getByRole("button", { name: "Redigera" });
    const actionRow = edit.parentElement;
    expect(actionRow?.className).toContain("flex-wrap");
    expect(screen.getByRole("button", { name: "Inaktivera" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(
      screen.getByRole("heading", { name: "Ta bort tjänsten permanent?" }),
    ).toBeTruthy();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("keeps the admin action visible for dependencies and offers inactivation when blocked", async () => {
    mock.remove.mockRejectedValueOnce(
      Object.assign(new Error("controlled"), {
        data: {
          code: "SERVICE_IN_USE",
          references: ["active_bookings"],
        },
      }),
    );
    render(<CoreDataConsole area="services" />);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    fireEvent.click(screen.getByRole("button", { name: "Ta bort tjänst" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "aktiva bokningar",
    );
    expect(screen.getByRole("button", { name: "Inaktivera i stället" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ta bort tjänst" })).toBeNull();
  });

  it("does not present permanent deletion as a member action", () => {
    mock.canDelete = false;
    render(<CoreDataConsole area="services" />);
    expect(screen.queryByRole("button", { name: "Ta bort" })).toBeNull();
    expect(screen.getByRole("button", { name: "Redigera" })).toBeTruthy();
  });
});
