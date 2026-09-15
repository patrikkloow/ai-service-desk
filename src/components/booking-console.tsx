"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function timestampFromInput(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

function localDateTimeInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BookingConsole() {
  const { isReady } = useTenantProvisioning();
  const customers = useQuery(api.customers.list, isReady ? {} : "skip");
  const services = useQuery(api.services.list, isReady ? {} : "skip");
  const bookings = useQuery(api.bookings.list, isReady ? {} : "skip");
  const createBooking = useMutation(api.bookings.create);
  const rescheduleBooking = useMutation(api.bookings.reschedule);
  const cancelBooking = useMutation(api.bookings.cancel);
  const completeBooking = useMutation(api.bookings.complete);
  const [customerId, setCustomerId] = useState<Id<"customers"> | "">("");
  const [serviceId, setServiceId] = useState<Id<"services"> | "">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeCustomers = customers?.filter(
    (customer) => customer.status === "active",
  );
  const activeServices = services?.filter((service) => service.status === "active");

  async function addBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const start = timestampFromInput(startTime);
    const end = timestampFromInput(endTime);

    if (customerId === "" || serviceId === "" || start === null || end === null) {
      setError("Choose a customer, service, and valid start and end times.");
      return;
    }

    try {
      await createBooking({
        customerId,
        serviceId,
        startTime: start,
        endTime: end,
        ...(notes.trim() ? { notes } : {}),
      });
      setStartTime("");
      setEndTime("");
      setNotes("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function reschedule(bookingId: Id<"bookings">, currentStart: number, currentEnd: number) {
    const startInput = window.prompt(
      "New start time (YYYY-MM-DDTHH:mm)",
      localDateTimeInput(currentStart),
    );
    if (startInput === null) return;
    const endInput = window.prompt(
      "New end time (YYYY-MM-DDTHH:mm)",
      localDateTimeInput(currentEnd),
    );
    if (endInput === null) return;

    const startTime = timestampFromInput(startInput);
    const endTime = timestampFromInput(endInput);
    if (startTime === null || endTime === null) {
      setError("Enter valid start and end times.");
      return;
    }

    try {
      await rescheduleBooking({ bookingId, startTime, endTime });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function changeStatus(
    bookingId: Id<"bookings">,
    action: "cancel" | "complete",
  ) {
    try {
      if (action === "cancel") {
        await cancelBooking({ bookingId });
      } else {
        await completeBooking({ bookingId });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 lg:col-span-2 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Bookings</h2>
      {error !== null ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={addBooking}>
        <select
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setCustomerId(event.target.value as Id<"customers">)}
          required
          value={customerId}
        >
          <option value="">Choose an active customer</option>
          {activeCustomers?.map((customer) => (
            <option key={customer._id} value={customer._id}>
              {customer.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setServiceId(event.target.value as Id<"services">)}
          required
          value={serviceId}
        >
          <option value="">Choose an active service</option>
          {activeServices?.map((service) => (
            <option key={service._id} value={service._id}>
              {service.name}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setStartTime(event.target.value)}
          required
          type="datetime-local"
          value={startTime}
        />
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setEndTime(event.target.value)}
          required
          type="datetime-local"
          value={endTime}
        />
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 md:col-span-2 dark:border-zinc-700"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes (optional)"
          value={notes}
        />
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white md:col-span-2 dark:bg-zinc-50 dark:text-zinc-950"
          type="submit"
        >
          Add booking
        </button>
      </form>
      <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
        {bookings?.map((booking) => (
          <li className="flex items-center justify-between gap-3 py-3" key={booking._id}>
            <div>
              <p className="font-medium">
                {booking.customerName} · {booking.serviceName}
              </p>
              <p className="text-sm text-zinc-500">
                {formatTime(booking.startTime)} – {formatTime(booking.endTime)} · {booking.status}
              </p>
            </div>
            {booking.status === "confirmed" ? (
              <div className="flex gap-2">
                <button
                  className="text-sm underline"
                  onClick={() => void reschedule(booking._id, booking.startTime, booking.endTime)}
                  type="button"
                >
                  Reschedule
                </button>
                <button
                  className="text-sm underline"
                  onClick={() => void changeStatus(booking._id, "complete")}
                  type="button"
                >
                  Complete
                </button>
                <button
                  className="text-sm text-red-700 underline dark:text-red-300"
                  onClick={() => void changeStatus(booking._id, "cancel")}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
