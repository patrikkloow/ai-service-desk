import { describe, expect, test, vi } from "vitest";
import {
  attemptCalendarDrop,
  scheduleOverrideReason,
} from "./calendar-drop";

describe("desktop drag rescheduling", () => {
  test("keeps a successful server reschedule", async () => {
    const revert = vi.fn();
    await expect(
      attemptCalendarDrop({ save: async () => "booking", revert }),
    ).resolves.toEqual({ kind: "saved" });
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

  test("waits for explicit schedule confirmation before reverting", async () => {
    const revert = vi.fn();
    const result = await attemptCalendarDrop({
      save: async () => {
        throw { data: { code: "SCHEDULE_OVERRIDE_REQUIRED", reason: "outside_schedule" } };
      },
      revert,
    });
    expect(result).toMatchObject({ kind: "confirmation_required" });
    expect(revert).not.toHaveBeenCalled();
  });

  test("accepts only a structurally valid Convex schedule error", () => {
    expect(
      scheduleOverrideReason({
        data: {
          code: "SCHEDULE_OVERRIDE_REQUIRED",
          reason: "outside_business_hours",
        },
      }),
    ).toContain("öppettider");
    expect(
      scheduleOverrideReason({
        data: { code: "SCHEDULE_OVERRIDE_REQUIRED", reason: "unknown" },
      }),
    ).toBeNull();
    expect(
      scheduleOverrideReason(
        new Error("SCHEDULE_OVERRIDE_REQUIRED outside_business_hours"),
      ),
    ).toBeNull();
    expect(
      scheduleOverrideReason({
        data: ["SCHEDULE_OVERRIDE_REQUIRED", "outside_business_hours"],
      }),
    ).toBeNull();
  });
});
