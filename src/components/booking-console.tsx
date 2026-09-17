"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

function errorMessage(): string {
  return "Ändringen kunde inte sparas. Kontrollera uppgifterna och försök igen.";
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
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
  const [busy, setBusy] = useState(false);
  const activeCustomers = customers?.filter(
    (customer) => customer.status === "active",
  );
  const activeServices = services?.filter((service) => service.status === "active");
  const [loadedAt] = useState(() => Date.now());
  type Booking = NonNullable<typeof bookings>[number];
  const rank = (booking: Booking) =>
    booking.status === "confirmed" && booking.startTime >= loadedAt
      ? 0
      : booking.status === "confirmed"
        ? 1
        : 2;
  const orderedBookings = [...(bookings ?? [])].sort((a, b) => {
    const difference = rank(a) - rank(b);
    if (difference !== 0) return difference;
    return rank(a) === 0
      ? a.startTime - b.startTime
      : b.startTime - a.startTime;
  });

  async function addBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const start = timestampFromInput(startTime);
    const end = timestampFromInput(endTime);

    if (customerId === "" || serviceId === "" || start === null || end === null) {
      setError("Välj kund, tjänst och giltiga start- och sluttider.");
      return;
    }

    setBusy(true);
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
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(bookingId: Id<"bookings">, currentStart: number, currentEnd: number) {
    const startInput = window.prompt(
      "Ny starttid (ÅÅÅÅ-MM-DDTHH:mm)",
      localDateTimeInput(currentStart),
    );
    if (startInput === null) return;
    const endInput = window.prompt(
      "Ny sluttid (ÅÅÅÅ-MM-DDTHH:mm)",
      localDateTimeInput(currentEnd),
    );
    if (endInput === null) return;

    const startTime = timestampFromInput(startInput);
    const endTime = timestampFromInput(endInput);
    if (startTime === null || endTime === null) {
      setError("Ange giltiga start- och sluttider.");
      return;
    }

    setBusy(true);
    try {
      await rescheduleBooking({ bookingId, startTime, endTime });
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(
    bookingId: Id<"bookings">,
    action: "cancel" | "complete",
  ) {
    const confirmed = window.confirm(
      action === "cancel"
        ? "Vill du avboka den här bokningen?"
        : "Vill du markera den här bokningen som genomförd?",
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      if (action === "cancel") {
        await cancelBooking({ bookingId });
      } else {
        await completeBooking({ bookingId });
      }
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 lg:col-span-2 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Bokningar</h2>
      {error !== null ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <details className="mt-4"><summary className="cursor-pointer py-3 font-medium">Ny bokning</summary><form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={addBooking}>
        <select aria-label="Kund"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setCustomerId(event.target.value as Id<"customers">)}
          required
          value={customerId}
        >
          <option value="">Välj en aktiv kund</option>
          {activeCustomers?.map((customer) => (
            <option key={customer._id} value={customer._id}>
              {customer.name}
            </option>
          ))}
        </select>
        <select aria-label="Tjänst"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setServiceId(event.target.value as Id<"services">)}
          required
          value={serviceId}
        >
          <option value="">Välj en aktiv tjänst</option>
          {activeServices?.map((service) => (
            <option key={service._id} value={service._id}>
              {service.name}
            </option>
          ))}
        </select>
        <label className="grid min-w-0 gap-2 text-sm">Starttid<input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setStartTime(event.target.value)}
          required
          type="datetime-local"
          value={startTime}
        /></label>
        <label className="grid gap-2 text-sm">Sluttid<input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setEndTime(event.target.value)}
          required
          type="datetime-local"
          value={endTime}
        /></label>
        <label className="grid gap-2 text-sm md:col-span-2">Anteckning (valfritt)<input
          className="rounded-md border border-zinc-300 px-3 py-2 md:col-span-2 dark:border-zinc-700"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Anteckning (valfritt)"
          value={notes}
        /></label>
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white md:col-span-2 dark:bg-zinc-50 dark:text-zinc-950"
          disabled={busy}
          type="submit"
        >
          {busy ? "Sparar…" : "Spara bokning"}
        </button>
      </form></details>
      {bookings === undefined ? <p role="status" className="mt-4">Laddar bokningar…</p> : bookings.length === 0 ? <p className="mt-4 text-muted-foreground">Inga bokningar ännu.</p> : null}
      <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
        {orderedBookings.map((booking) => (
          <li className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center" key={booking._id}>
            <div>
              <p className="font-medium">
                {booking.customerName} · {booking.serviceName}
              </p>
              <p className="text-sm text-zinc-500">
                {formatTime(booking.startTime)} – {formatTime(booking.endTime)} · {booking.status === "confirmed" ? "Bekräftad" : booking.status === "cancelled" ? "Avbokad" : "Genomförd"}
              </p>
            </div>
            {booking.status === "confirmed" ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className="min-h-11 px-2 text-sm underline"
                  disabled={busy}
                  onClick={() => void reschedule(booking._id, booking.startTime, booking.endTime)}
                  type="button"
                >
                  Boka om
                </button>
                <button
                  className="min-h-11 px-2 text-sm underline"
                  disabled={busy}
                  onClick={() => void changeStatus(booking._id, "complete")}
                  type="button"
                >
                  Markera som genomförd
                </button>
                <button
                  className="min-h-11 px-2 text-sm text-red-700 underline dark:text-red-300"
                  disabled={busy}
                  onClick={() => void changeStatus(booking._id, "cancel")}
                  type="button"
                >
                  Avboka
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Kommande bekräftade bokningar visas närmast först. Listan visar högst 100 bokningar.
      </p>
    </section>
  );
}
