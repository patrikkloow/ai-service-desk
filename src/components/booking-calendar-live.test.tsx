// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { BookingCalendarLive } from "./booking-calendar-live";

const outsideStart = Date.parse("2033-05-16T04:00:00Z");

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  reschedule: vi.fn(),
  assign: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  revert: vi.fn(),
  calendarProps: null as null | Record<string, (...args: never[]) => unknown>,
}));

vi.mock("./tenant-bootstrap", () => ({
  useTenantProvisioning: () => ({ isReady: true, error: null }),
}));

vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, (...args: never[]) => unknown>) => {
    mock.calendarProps = props;
    return (
      <div>
        <button
          onClick={() =>
            props.eventClick({ event: { id: "booking-1" } } as never)
          }
          type="button"
        >
          Öppna testbokning
        </button>
        <button
          onClick={() =>
            props.eventDrop({
              event: {
                id: "booking-1",
                start: new Date(outsideStart),
                end: new Date(outsideStart + 60 * 60 * 1000),
                extendedProps: { resourceId: "resource-1", updatedAt: 7 },
              },
              revert: mock.revert,
            } as never)
          }
          type="button"
        >
          Simulera drag
        </button>
      </div>
    );
  },
}));
vi.mock("@fullcalendar/react/interaction", () => ({ default: {} }));
vi.mock("@fullcalendar/react/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/react/themes/forma", () => ({ default: {} }));
vi.mock("@fullcalendar/react/locales/sv", () => ({ default: {} }));

vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "calendarBookings:create") return mock.create;
    if (name === "calendarBookings:reschedule") return mock.reschedule;
    if (name === "calendarBookings:assignLegacyResource") return mock.assign;
    if (name === "bookings:cancel") return mock.cancel;
    if (name === "bookings:complete") return mock.complete;
    throw new Error(`Unexpected mutation: ${name}`);
  },
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "calendarBookings:context")
      return {
        timezone: "Europe/Stockholm",
        customers: [
          { _id: "customer-1", name: "Testkund", email: "kund@example.test" },
        ],
        services: [
          {
            _id: "service-1",
            name: "Testtjänst",
            durationMinutes: 60,
            resourceIds: ["resource-1"],
          },
        ],
        resources: [
          {
            _id: "resource-1",
            name: "Testresurs",
            status: "active",
            scheduleConfigured: true,
          },
        ],
        requests: [],
      };
    if (name === "calendarBookings:listRange")
      return [
        {
          _id: "booking-1",
          customerName: "Testkund",
          customerId: "customer-1",
          serviceName: "Testtjänst",
          serviceId: "service-1",
          servicePricing: { kind: "not_specified" },
          resourceName: "Testresurs",
          resourceId: "resource-1",
          startTime: Date.parse("2033-05-16T08:00:00Z"),
          endTime: Date.parse("2033-05-16T09:00:00Z"),
          status: "confirmed",
          updatedAt: 7,
          createdAt: 1,
        },
      ];
    if (name === "calendarBookings:detail") return null;
    throw new Error(`Unexpected query: ${name}`);
  },
}));

function scheduleError() {
  return Object.assign(new Error("controlled Convex rejection"), {
    data: {
      code: "SCHEDULE_OVERRIDE_REQUIRED",
      reason: "outside_business_hours",
    },
  });
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
  mock.create.mockReset();
  mock.reschedule.mockReset();
  mock.assign.mockReset().mockResolvedValue(undefined);
  mock.cancel.mockReset().mockResolvedValue(undefined);
  mock.complete.mockReset().mockResolvedValue(undefined);
  mock.revert.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("staff schedule confirmation", () => {
  it("confirms a new booking with the exact rejected input", async () => {
    mock.create.mockRejectedValueOnce(scheduleError()).mockResolvedValueOnce("new-booking");
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Ny bokning" }));
    fireEvent.change(screen.getByLabelText("Kund"), { target: { value: "customer-1" } });
    fireEvent.change(screen.getByLabelText("Tjänst"), { target: { value: "service-1" } });
    fireEvent.change(screen.getByLabelText(/Starttid i/), { target: { value: "2033-05-16T06:00" } });
    fireEvent.change(screen.getByLabelText("Resurs"), { target: { value: "resource-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Spara bokning" }));
    expect(await screen.findByRole("heading", { name: "Boka utanför ordinarie arbetstid?" })).toBeTruthy();
    const rejectedInput = mock.create.mock.calls[0][0];
    expect(rejectedInput.confirmScheduleOverride).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Boka ändå" }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
    expect(mock.create.mock.calls[1][0]).toEqual({
      ...rejectedInput,
      confirmScheduleOverride: true,
    });
  });

  it("confirms a form reschedule with the same booking version and intended move", async () => {
    mock.reschedule.mockRejectedValueOnce(scheduleError()).mockResolvedValueOnce(undefined);
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna testbokning" }));
    fireEvent.click(screen.getByRole("button", { name: "Boka om" }));
    fireEvent.change(screen.getByLabelText("Ny starttid"), { target: { value: "2033-05-16T06:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Spara ombokning" }));
    expect(await screen.findByRole("heading", { name: "Flytta utanför ordinarie arbetstid?" })).toBeTruthy();
    const rejectedInput = mock.reschedule.mock.calls[0][0];
    expect(rejectedInput).toMatchObject({
      bookingId: "booking-1",
      resourceId: "resource-1",
      expectedUpdatedAt: 7,
    });
    fireEvent.click(screen.getByRole("button", { name: "Flytta ändå" }));
    await waitFor(() => expect(mock.reschedule).toHaveBeenCalledTimes(2));
    expect(mock.reschedule.mock.calls[1][0]).toEqual({
      ...rejectedInput,
      confirmScheduleOverride: true,
    });
  });

  it("reverts a dragged booking when staff cancels the override", async () => {
    mock.reschedule.mockRejectedValueOnce(scheduleError());
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    expect(await screen.findByRole("button", { name: "Flytta ändå" })).toBeTruthy();
    expect(mock.revert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(mock.revert).toHaveBeenCalledOnce();
    expect(mock.reschedule).toHaveBeenCalledOnce();
  });

  it("keeps a dragged booking only after the confirmed server write", async () => {
    mock.reschedule.mockRejectedValueOnce(scheduleError()).mockResolvedValueOnce(undefined);
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    expect(await screen.findByRole("button", { name: "Flytta ändå" })).toBeTruthy();
    const rejectedInput = mock.reschedule.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "Flytta ändå" }));
    await waitFor(() => expect(mock.reschedule).toHaveBeenCalledTimes(2));
    expect(mock.reschedule.mock.calls[1][0]).toEqual({
      ...rejectedInput,
      confirmScheduleOverride: true,
    });
    expect(mock.revert).not.toHaveBeenCalled();
  });
});
