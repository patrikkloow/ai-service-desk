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
  revertSecond: vi.fn(),
  revertOther: vi.fn(),
  setExtendedProp: vi.fn(),
  query: vi.fn(),
  dragVersion: 7,
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
                extendedProps: { resourceId: "resource-1", updatedAt: mock.dragVersion },
                setExtendedProp: mock.setExtendedProp,
              },
              revert: mock.revert,
            } as never)
          }
          type="button"
        >
          Simulera drag
        </button>
        <button
          onClick={() =>
            props.eventDrop({
              event: {
                id: "booking-1",
                start: new Date(outsideStart + 2 * 60 * 60 * 1000),
                end: new Date(outsideStart + 3 * 60 * 60 * 1000),
                extendedProps: { resourceId: "resource-1", updatedAt: mock.dragVersion },
                setExtendedProp: mock.setExtendedProp,
              },
              revert: mock.revertSecond,
            } as never)
          }
          type="button"
        >
          Simulera andra drag
        </button>
        <button
          onClick={() =>
            props.eventDrop({
              event: {
                id: "booking-2",
                start: new Date(outsideStart),
                end: new Date(outsideStart + 60 * 60 * 1000),
                extendedProps: { resourceId: "resource-1", updatedAt: 11 },
                setExtendedProp: vi.fn(),
              },
              revert: mock.revertOther,
            } as never)
          }
          type="button"
        >
          Simulera annan bokning
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
  useConvex: () => ({ query: mock.query }),
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
            serviceRestrictionMode: "selected",
            serviceIds: ["service-1"],
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

function needsConfirmation() {
  return {
    status: "needs_confirmation" as const,
    reason: "outside_business_hours" as const,
  };
}

function saved(updatedAt = 8) {
  return {
    status: "saved" as const,
    bookingId: "booking-1",
    updatedAt,
  };
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
  mock.revertSecond.mockReset();
  mock.revertOther.mockReset();
  mock.dragVersion = 7;
  mock.setExtendedProp.mockReset().mockImplementation((name, value) => {
    if (name === "updatedAt" && typeof value === "number")
      mock.dragVersion = value;
  });
  mock.query.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("staff schedule confirmation", () => {
  it("confirms a new booking with the exact rejected input", async () => {
    mock.create.mockResolvedValueOnce(needsConfirmation()).mockResolvedValueOnce(saved());
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
    mock.reschedule.mockResolvedValueOnce(needsConfirmation()).mockResolvedValueOnce(saved());
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
    mock.reschedule.mockResolvedValueOnce(needsConfirmation());
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    expect(await screen.findByRole("button", { name: "Flytta ändå" })).toBeTruthy();
    expect(mock.revert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(mock.revert).toHaveBeenCalledOnce();
    expect(mock.reschedule).toHaveBeenCalledOnce();
  });

  it("keeps a dragged booking only after the confirmed server write", async () => {
    mock.reschedule.mockResolvedValueOnce(needsConfirmation()).mockResolvedValueOnce(saved());
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

  it("synchronously rejects a second drag of the same booking while the first is pending", async () => {
    let resolveFirst!: (value: ReturnType<typeof needsConfirmation>) => void;
    mock.reschedule.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Simulera andra drag" }),
    );
    expect(mock.reschedule).toHaveBeenCalledOnce();
    expect(mock.revertSecond).toHaveBeenCalledOnce();
    resolveFirst(needsConfirmation());
    expect(await screen.findByRole("button", { name: "Flytta ändå" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(mock.revert).toHaveBeenCalledOnce();
  });

  it("requires a fresh confirmation for a second move and uses the saved server version", async () => {
    mock.reschedule
      .mockResolvedValueOnce(needsConfirmation())
      .mockResolvedValueOnce(saved(8))
      .mockResolvedValueOnce(needsConfirmation());
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Flytta ändå" }),
    );
    await waitFor(() => expect(mock.dragVersion).toBe(8));
    fireEvent.click(
      screen.getByRole("button", { name: "Simulera andra drag" }),
    );
    expect(await screen.findByRole("button", { name: "Flytta ändå" })).toBeTruthy();
    expect(mock.reschedule.mock.calls[2][0]).toMatchObject({
      expectedUpdatedAt: 8,
      startTime: outsideStart + 2 * 60 * 60 * 1000,
    });
  });

  it("does not lock a different booking while one save is pending", async () => {
    let resolveFirst!: (value: ReturnType<typeof saved>) => void;
    mock.reschedule
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(saved(12));
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Simulera annan bokning" }),
    );
    await waitFor(() => expect(mock.reschedule).toHaveBeenCalledTimes(2));
    expect(mock.reschedule.mock.calls[1][0]).toMatchObject({
      bookingId: "booking-2",
      expectedUpdatedAt: 11,
    });
    expect(mock.revertOther).not.toHaveBeenCalled();
    resolveFirst(saved(8));
  });

  it("reads authoritative state after an uncertain drag result without retrying", async () => {
    mock.reschedule.mockRejectedValueOnce(new Error("network unavailable"));
    mock.query.mockResolvedValueOnce({
      bookingId: "booking-1",
      resourceId: "resource-1",
      startTime: outsideStart,
      endTime: outsideStart + 60 * 60 * 1000,
      status: "confirmed",
      updatedAt: 9,
    });
    render(<BookingCalendarLive />);
    fireEvent.click(screen.getByRole("button", { name: "Simulera drag" }));
    await waitFor(() =>
      expect(mock.setExtendedProp).toHaveBeenCalledWith("updatedAt", 9),
    );
    expect(mock.reschedule).toHaveBeenCalledOnce();
    expect(mock.revert).not.toHaveBeenCalled();
  });
});
