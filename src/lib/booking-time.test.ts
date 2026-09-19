import { describe, expect, test } from "vitest";
import { epochToLocalInput, localDateTimeToEpoch } from "./booking-time";

describe("business timezone booking input", () => {
  test("rejects nonexistent and ambiguous Stockholm times", () => {
    expect(
      localDateTimeToEpoch("2026-03-29T02:30", "Europe/Stockholm"),
    ).toBeNull();
    expect(
      localDateTimeToEpoch("2026-10-25T02:30", "Europe/Stockholm"),
    ).toBeNull();
  });

  test("round-trips an ordinary local time without browser timezone authority", () => {
    const epoch = localDateTimeToEpoch("2026-02-12T10:15", "Europe/Stockholm");
    expect(epoch).not.toBeNull();
    expect(epochToLocalInput(epoch!, "Europe/Stockholm")).toBe(
      "2026-02-12T10:15",
    );
  });
});
