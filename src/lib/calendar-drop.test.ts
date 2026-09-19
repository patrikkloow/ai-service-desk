import { describe, expect, test, vi } from "vitest";
import {
  attemptCalendarDrop,
  bookingRejectionText,
  scheduleConfirmationText,
} from "./calendar-drop";

describe("desktop drag rescheduling", () => {
  test("keeps a successful server reschedule", async () => {
    const revert = vi.fn();
    await expect(
      attemptCalendarDrop({
        save: async () => ({
          status: "saved",
          bookingId: "booking",
          updatedAt: 2,
        }),
        revert,
      }),
    ).resolves.toMatchObject({ kind: "saved" });
    expect(revert).not.toHaveBeenCalled();
  });

  test("reverts a rejected drop", async () => {
    const revert = vi.fn();
    const failure = Object.assign(new Error("changed"), {
      data: { code: "BOOKING_CHANGED" },
    });
    const result = await attemptCalendarDrop({
      save: async () => {
        throw failure;
      },
      revert,
    });
    expect(result).toEqual({ kind: "rejected", reason: failure });
    expect(revert).toHaveBeenCalledOnce();
  });

  test("reverts a typed booking conflict without an exception", async () => {
    const revert = vi.fn();
    const result = await attemptCalendarDrop({
      save: async () => ({
        status: "rejected",
        reason: "booking_conflict",
      }),
      revert,
    });
    expect(result).toEqual({ kind: "rejected", reason: "booking_conflict" });
    expect(revert).toHaveBeenCalledOnce();
    expect(bookingRejectionText("booking_conflict")).toBe(
      "Tiden är redan bokad för den valda resursen. Välj en annan tid eller resurs.",
    );
  });

  test("treats typed schedule confirmation as a normal result", async () => {
    const revert = vi.fn();
    const result = await attemptCalendarDrop({
      save: async () => ({
        status: "needs_confirmation",
        reason: "outside_schedule",
      }),
      revert,
    });
    expect(result).toMatchObject({ kind: "confirmation_required" });
    expect(revert).not.toHaveBeenCalled();
  });

  test("uses explicit Swedish action text for typed reasons", () => {
    expect(
      scheduleConfirmationText("create", "outside_business_hours"),
    ).toBe("Tiden ligger utanför ordinarie arbetstid. Vill du boka ändå?");
    expect(
      scheduleConfirmationText("reschedule", "outside_schedule"),
    ).toContain("resursens ordinarie arbetstid");
  });
});
