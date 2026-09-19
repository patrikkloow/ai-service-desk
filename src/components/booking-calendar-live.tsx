"use client";

import { useRef, useState } from "react";
import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
  type DatesSetInfo,
  type EventClickInfo,
  type EventInput,
} from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import formaThemePlugin from "@fullcalendar/react/themes/forma";
import svLocale from "@fullcalendar/react/locales/sv";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "@/components/tenant-bootstrap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addMinutesToLocalInput,
  epochToLocalInput,
  localDate,
  localDateTimeToEpoch,
} from "@/lib/booking-time";

const DAY_MS = 86_400_000;

function initialRange() {
  const now = Date.now();
  return { startTime: now - 8 * DAY_MS, endTime: now + 15 * DAY_MS };
}

function statusLabel(status: "confirmed" | "cancelled" | "completed") {
  return status === "confirmed"
    ? "Bekräftad"
    : status === "cancelled"
      ? "Avbokad"
      : "Genomförd";
}

function idempotencyKey() {
  return crypto.randomUUID().replaceAll("-", "");
}

function bookingError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : "";
  if (message.includes("booking_conflict"))
    return "Tiden är redan upptagen för den valda resursen.";
  if (message.includes("outside_schedule"))
    return "Tiden ligger utanför resursens bokningsbara schema.";
  if (message.includes("schedule_missing"))
    return "Resursen behöver ett konfigurerat schema.";
  if (message.includes("resource_unavailable"))
    return "Resursen är inte tillgänglig för bokningen.";
  if (message.includes("service_not_supported"))
    return "Resursen kan inte bokas för den valda tjänsten.";
  if (message.includes("Idempotency key"))
    return "Bokningsförsöket har ändrats. Stäng dialogen och försök igen.";
  if (message.includes("email")) return "Kundens e-postadress är ogiltig.";
  if (message.includes("already has a booking"))
    return "Förfrågan är redan kopplad till en bokning.";
  return fallback;
}

export function BookingCalendarLive() {
  const { isReady } = useTenantProvisioning();
  const context = useQuery(api.calendarBookings.context, isReady ? {} : "skip");
  const [range, setRange] = useState(initialRange);
  const [todayAtMount] = useState(() => Date.now());
  const [resourceFilter, setResourceFilter] = useState<Id<"resources"> | "all">(
    "all",
  );
  const bookings = useQuery(
    api.calendarBookings.listRange,
    isReady
      ? {
          ...range,
          ...(resourceFilter === "all" ? {} : { resourceId: resourceFilter }),
        }
      : "skip",
  );
  const createBooking = useMutation(api.calendarBookings.create);
  const rescheduleBooking = useMutation(api.calendarBookings.reschedule);
  const assignLegacyResource = useMutation(
    api.calendarBookings.assignLegacyResource,
  );
  const cancelBooking = useMutation(api.bookings.cancel);
  const completeBooking = useMutation(api.bookings.complete);
  const calendarRef = useRef<CalendarRef>(null);
  const savingRef = useRef(false);
  const [mobileDate, setMobileDate] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"bookings"> | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    "existing",
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState<Id<"customers"> | "">("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState<Id<"services"> | "">("");
  const [resourceId, setResourceId] = useState<Id<"resources"> | "">("");
  const [requestId, setRequestId] = useState<Id<"serviceRequests"> | "">("");
  const [startLocal, setStartLocal] = useState("");
  const [notes, setNotes] = useState("");
  const [attemptKey, setAttemptKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = context?.timezone ?? "Europe/Stockholm";
  type Booking = NonNullable<typeof bookings>[number];
  const selected =
    bookings?.find((booking) => booking._id === selectedId) ?? null;
  const service = context?.services.find((item) => item._id === serviceId);
  const duration = service?.durationMinutes;
  const activeResources = (context?.resources ?? []).filter(
    (resource) =>
      resource.status === "active" &&
      resource.scheduleConfigured &&
      (!service ||
        service.resourceIds.length === 0 ||
        service.resourceIds.includes(resource._id)),
  );
  const selectedResources = (() => {
    const selectedService = context?.services.find(
      (item) => item._id === selected?.serviceId,
    );
    return (context?.resources ?? []).filter(
      (resource) =>
        resource.status === "active" &&
        resource.scheduleConfigured &&
        (!selectedService ||
          selectedService.resourceIds.length === 0 ||
          selectedService.resourceIds.includes(resource._id)),
    );
  })();
  const customerResults = (() => {
    const needle = customerSearch.trim().toLocaleLowerCase("sv");
    return (context?.customers ?? [])
      .filter((customer) =>
        !needle
          ? true
          : `${customer.name} ${customer.email ?? ""} ${customer.phone ?? ""}`
              .toLocaleLowerCase("sv")
              .includes(needle),
      )
      .slice(0, 20);
  })();
  const matchingRequests = (context?.requests ?? []).filter(
    (request) =>
      request.status !== "completed" &&
      request.status !== "cancelled" &&
      (!customerId ||
        !request.customerId ||
        request.customerId === customerId) &&
      (!serviceId || !request.serviceId || request.serviceId === serviceId),
  );
  const linkedRequest = context?.requests.find(
    (request) => request._id === selected?.serviceRequestId,
  );
  const events: EventInput[] = (bookings ?? []).map((booking) => ({
    id: booking._id,
    title: `${booking.customerName} · ${booking.serviceName} · ${booking.resourceName ?? "Resurs behöver tilldelas"}`,
    start: booking.startTime,
    end: booking.endTime,
    classNames: booking.status === "cancelled" ? ["opacity-50"] : [],
  }));
  const shownMobileDate = mobileDate || localDate(todayAtMount, timezone);
  const mobileBookings = [...(bookings ?? [])]
    .filter(
      (booking) => localDate(booking.startTime, timezone) === shownMobileDate,
    )
    .sort((left, right) => left.startTime - right.startTime);

  function markDraftChanged() {
    if (attemptKey) setAttemptKey(idempotencyKey());
    setError(null);
  }

  function openCreate(value?: string) {
    const start = value || `${shownMobileDate}T09:00`;
    setCustomerMode("existing");
    setCustomerSearch("");
    setCustomerId("");
    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setServiceId("");
    setResourceId("");
    setRequestId("");
    setStartLocal(start.slice(0, 16));
    setNotes("");
    setAttemptKey(idempotencyKey());
    setError(null);
    setCreateOpen(true);
  }

  function handleDateClick(info: DateClickInfo) {
    openCreate(epochToLocalInput(info.date.getTime(), timezone));
  }

  function handleDatesSet(info: DatesSetInfo) {
    setRange({
      startTime: info.start.getTime() - DAY_MS,
      endTime: info.end.getTime() + DAY_MS,
    });
    if (!mobileDate) setMobileDate(localDate(info.start.getTime(), timezone));
  }

  function handleEventClick(info: EventClickInfo) {
    setSelectedId(info.event.id as Id<"bookings">);
    setRescheduling(false);
    setConfirmingCancel(false);
    setError(null);
  }

  function moveMobileDay(days: number) {
    const epoch = localDateTimeToEpoch(`${shownMobileDate}T12:00`, timezone);
    if (epoch === null) return;
    const next = localDate(epoch + days * DAY_MS, timezone);
    setMobileDate(next);
    const nextEpoch = localDateTimeToEpoch(`${next}T00:00`, timezone);
    if (
      nextEpoch !== null &&
      (nextEpoch < range.startTime || nextEpoch >= range.endTime)
    )
      setRange({
        startTime: nextEpoch - DAY_MS,
        endTime: nextEpoch + 8 * DAY_MS,
      });
  }

  function selectMobileDate(next: string) {
    setMobileDate(next);
    const nextEpoch = localDateTimeToEpoch(`${next}T00:00`, timezone);
    if (
      nextEpoch !== null &&
      (nextEpoch < range.startTime || nextEpoch >= range.endTime)
    )
      setRange({
        startTime: nextEpoch - DAY_MS,
        endTime: nextEpoch + 8 * DAY_MS,
      });
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const startTime = localDateTimeToEpoch(startLocal, timezone);
    if (startTime === null) {
      setError("Tiden finns inte eller är tvetydig i företagets tidszon.");
      return;
    }
    if (!duration || duration < 1) {
      setError("Tjänsten behöver en tidsåtgång under Tjänster & priser.");
      return;
    }
    if (
      !serviceId ||
      !resourceId ||
      (!customerId && customerMode === "existing")
    ) {
      setError("Välj kund, tjänst och resurs.");
      return;
    }
    savingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await createBooking({
        idempotencyKey: attemptKey,
        customer:
          customerMode === "existing"
            ? { kind: "existing", customerId: customerId as Id<"customers"> }
            : {
                kind: "new",
                name: newCustomerName,
                ...(newCustomerEmail.trim() ? { email: newCustomerEmail } : {}),
                ...(newCustomerPhone.trim() ? { phone: newCustomerPhone } : {}),
              },
        serviceId,
        resourceId,
        ...(requestId ? { serviceRequestId: requestId } : {}),
        startTime,
        endTime: startTime + duration * 60_000,
        ...(notes.trim() ? { notes } : {}),
      });
      setCreateOpen(false);
    } catch (reason) {
      setError(bookingError(reason, "Bokningen kunde inte sparas."));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  async function submitReschedule(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !resourceId || savingRef.current) return;
    const startTime = localDateTimeToEpoch(startLocal, timezone);
    if (startTime === null) {
      setError("Tiden finns inte eller är tvetydig i företagets tidszon.");
      return;
    }
    savingRef.current = true;
    setBusy(true);
    try {
      await rescheduleBooking({
        bookingId: selected._id,
        resourceId,
        startTime,
        endTime: startTime + (selected.endTime - selected.startTime),
      });
      setRescheduling(false);
      setError(null);
    } catch (reason) {
      setError(bookingError(reason, "Ombokningen kunde inte sparas."));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  async function changeStatus(booking: Booking, action: "cancel" | "complete") {
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      if (action === "cancel") await cancelBooking({ bookingId: booking._id });
      else await completeBooking({ bookingId: booking._id });
      setSelectedId(null);
    } catch (reason) {
      setError(bookingError(reason, "Ändringen kunde inte sparas."));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  if (!isReady || !context)
    return <p role="status">Laddar kalender och resurser…</p>;

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid gap-2 text-sm font-medium sm:w-64">
          Visa resurs
          <select
            className="rounded-lg border bg-background px-3"
            onChange={(event) =>
              setResourceFilter(event.target.value as typeof resourceFilter)
            }
            value={resourceFilter}
          >
            <option value="all">Alla resurser</option>
            {context.resources.map((resource) => (
              <option key={resource._id} value={resource._id}>
                {resource.name}
                {resource.status === "inactive" ? " (inaktiv)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Tidszon: {timezone}
          </span>
          <Button onClick={() => openCreate()}>
            <CalendarPlus aria-hidden="true" />
            Ny bokning
          </Button>
        </div>
      </div>
      {context.resources.filter(
        (resource) =>
          resource.status === "active" && resource.scheduleConfigured,
      ).length === 0 ? (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          Ingen aktiv resurs har ett konfigurerat schema. Lägg upp resursens
          bokningsbara tider under Inställningar → Resurser.
        </p>
      ) : null}
      <div className="booking-calendar-theme hidden min-w-0 overflow-hidden rounded-xl border bg-card md:block">
        <FullCalendar
          allDaySlot={false}
          dateClick={handleDateClick}
          datesSet={handleDatesSet}
          editable={false}
          eventClick={handleEventClick}
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek",
          }}
          height="auto"
          initialView="timeGridWeek"
          locale={svLocale}
          nowIndicator
          plugins={[formaThemePlugin, interactionPlugin, timeGridPlugin]}
          ref={calendarRef}
          slotDuration="00:30:00"
          slotMaxTime="20:00:00"
          slotMinTime="07:00:00"
          timeZone={timezone}
        />
      </div>
      <div className="space-y-3 md:hidden">
        <div className="flex items-center justify-between rounded-xl border bg-card p-2">
          <Button
            aria-label="Föregående dag"
            onClick={() => moveMobileDay(-1)}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <label className="grid gap-1 text-center text-sm font-medium">
            Vald dag
            <Input
              onChange={(event) => selectMobileDate(event.target.value)}
              type="date"
              value={shownMobileDate}
            />
          </label>
          <Button
            aria-label="Nästa dag"
            onClick={() => moveMobileDay(1)}
            size="icon"
            variant="ghost"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {bookings === undefined ? (
          <p role="status">Laddar bokningar…</p>
        ) : mobileBookings.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Inga bokningar den här dagen.
          </p>
        ) : (
          <ul className="space-y-3">
            {mobileBookings.map((booking) => (
              <li key={booking._id}>
                <button
                  className="flex min-h-11 w-full flex-col rounded-xl border bg-card p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelectedId(booking._id)}
                  type="button"
                >
                  <span className="font-medium">
                    {booking.customerName} · {booking.serviceName}
                  </span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {epochToLocalInput(booking.startTime, timezone).slice(11)}–
                    {epochToLocalInput(booking.endTime, timezone).slice(11)} ·{" "}
                    {booking.resourceName ?? "Resurs behöver tilldelas"} ·{" "}
                    {statusLabel(booking.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => !busy && setCreateOpen(open)}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ny bokning</DialogTitle>
            <DialogDescription>
              Bokningen kontrolleras mot resursens schema, blockerade tider och
              andra bokningar.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onChange={markDraftChanged}
            onSubmit={submitCreate}
          >
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => setCustomerMode("existing")}
                type="button"
                variant={customerMode === "existing" ? "default" : "outline"}
              >
                Befintlig kund
              </Button>
              <Button
                onClick={() => setCustomerMode("new")}
                type="button"
                variant={customerMode === "new" ? "default" : "outline"}
              >
                Ny kund
              </Button>
            </div>
            {customerMode === "existing" ? (
              <>
                <label className="grid gap-2 text-sm font-medium">
                  Sök kund
                  <Input
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Namn, e-post eller telefon"
                    value={customerSearch}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Kund
                  <select
                    className="rounded-lg border bg-background px-3"
                    onChange={(event) =>
                      setCustomerId(event.target.value as Id<"customers"> | "")
                    }
                    required
                    value={customerId}
                  >
                    <option value="">Välj kund</option>
                    {customerResults.map((customer) => (
                      <option key={customer._id} value={customer._id}>
                        {customer.name}
                        {customer.email ? ` · ${customer.email}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                  Kundnamn
                  <Input
                    onChange={(event) => setNewCustomerName(event.target.value)}
                    required
                    value={newCustomerName}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  E-post
                  <Input
                    onChange={(event) =>
                      setNewCustomerEmail(event.target.value)
                    }
                    type="email"
                    value={newCustomerEmail}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Telefon
                  <Input
                    onChange={(event) =>
                      setNewCustomerPhone(event.target.value)
                    }
                    value={newCustomerPhone}
                  />
                </label>
              </div>
            )}
            <label className="grid gap-2 text-sm font-medium">
              Tjänst
              <select
                className="rounded-lg border bg-background px-3"
                onChange={(event) => {
                  const next = event.target.value as Id<"services"> | "";
                  setServiceId(next);
                  if (resourceId) {
                    const nextService = context.services.find(
                      (item) => item._id === next,
                    );
                    if (
                      nextService &&
                      nextService.resourceIds.length > 0 &&
                      !nextService.resourceIds.includes(resourceId)
                    )
                      setResourceId("");
                  }
                }}
                required
                value={serviceId}
              >
                <option value="">Välj tjänst</option>
                {context.services.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                    {item.durationMinutes
                      ? ` · ${item.durationMinutes} min`
                      : " · tidsåtgång saknas"}
                  </option>
                ))}
              </select>
            </label>
            {serviceId && (!duration || duration < 1) ? (
              <p className="text-sm text-destructive" role="alert">
                Tjänsten behöver en användbar tidsåtgång under Tjänster & priser
                innan den kan bokas.
              </p>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              Starttid i {timezone}
              <Input
                onChange={(event) => setStartLocal(event.target.value)}
                required
                type="datetime-local"
                value={startLocal}
              />
            </label>
            {duration && startLocal ? (
              <p className="text-sm text-muted-foreground">
                Föreslagen sluttid:{" "}
                {addMinutesToLocalInput(startLocal, duration, timezone).replace(
                  "T",
                  " ",
                )}{" "}
                ({duration} minuter).
              </p>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              Resurs
              <select
                className="rounded-lg border bg-background px-3"
                onChange={(event) =>
                  setResourceId(event.target.value as Id<"resources"> | "")
                }
                required
                value={resourceId}
              >
                <option value="">Välj bokningsbar resurs</option>
                {activeResources.map((resource) => (
                  <option key={resource._id} value={resource._id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Förfrågan (valfritt)
              <select
                className="rounded-lg border bg-background px-3"
                onChange={(event) =>
                  setRequestId(event.target.value as Id<"serviceRequests"> | "")
                }
                value={requestId}
              >
                <option value="">Ingen koppling</option>
                {matchingRequests.map((request) => (
                  <option key={request._id} value={request._id}>
                    {request.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Anteckning (valfritt)
              <Textarea
                maxLength={10000}
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </label>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={busy} type="submit">
                {busy ? "Sparar…" : "Spara bokning"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !busy && !open && setSelectedId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected
                ? `${selected.customerName} · ${selected.serviceName}`
                : "Bokning"}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${epochToLocalInput(selected.startTime, timezone).replace("T", " ")}–${epochToLocalInput(selected.endTime, timezone).slice(11)} · ${selected.resourceName ?? "Resurs behöver tilldelas"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <p className="text-sm">Status: {statusLabel(selected.status)}</p>
              {selected.notes ? (
                <p className="rounded-lg bg-muted p-3 text-sm">
                  {selected.notes}
                </p>
              ) : null}
              {selected.serviceRequestId ? (
                <p className="text-sm">
                  Förfrågan: {linkedRequest?.title ?? "Kopplad förfrågan"}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {rescheduling ? (
                <form className="grid gap-3" onSubmit={submitReschedule}>
                  <label className="grid gap-2 text-sm font-medium">
                    Ny starttid
                    <Input
                      onChange={(event) => setStartLocal(event.target.value)}
                      required
                      type="datetime-local"
                      value={startLocal}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Resurs
                    <select
                      className="rounded-lg border bg-background px-3"
                      onChange={(event) =>
                        setResourceId(
                          event.target.value as Id<"resources"> | "",
                        )
                      }
                      required
                      value={resourceId}
                    >
                      <option value="">Välj resurs</option>
                      {selectedResources.map((resource) => (
                        <option key={resource._id} value={resource._id}>
                          {resource.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <Button disabled={busy} type="submit">
                      Spara ombokning
                    </Button>
                    <Button
                      onClick={() => setRescheduling(false)}
                      type="button"
                      variant="outline"
                    >
                      Avbryt
                    </Button>
                  </div>
                </form>
              ) : selected.status === "confirmed" ? (
                <div className="flex flex-wrap gap-2">
                  {selected.resourceId ? (
                    <Button
                      onClick={() => {
                        setStartLocal(
                          epochToLocalInput(selected.startTime, timezone),
                        );
                        setResourceId(selected.resourceId!);
                        setRescheduling(true);
                      }}
                      variant="outline"
                    >
                      Boka om
                    </Button>
                  ) : (
                    <>
                      <select
                        aria-label="Tilldela resurs"
                        className="w-auto rounded-lg border bg-background px-3"
                        onChange={(event) =>
                          setResourceId(
                            event.target.value as Id<"resources"> | "",
                          )
                        }
                        value={resourceId}
                      >
                        <option value="">Välj resurs</option>
                        {selectedResources.map((resource) => (
                          <option key={resource._id} value={resource._id}>
                            {resource.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        disabled={!resourceId || busy}
                        onClick={() =>
                          void assignLegacyResource({
                            bookingId: selected._id,
                            resourceId: resourceId as Id<"resources">,
                          })
                            .then(() => setSelectedId(null))
                            .catch((reason) =>
                              setError(
                                bookingError(
                                  reason,
                                  "Resursen kunde inte tilldelas.",
                                ),
                              ),
                            )
                        }
                      >
                        Tilldela resurs
                      </Button>
                    </>
                  )}
                  <Button
                    disabled={busy}
                    onClick={() => void changeStatus(selected, "complete")}
                    variant="outline"
                  >
                    Markera genomförd
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setConfirmingCancel(true)}
                    variant="destructive"
                  >
                    Avboka
                  </Button>
                  {confirmingCancel ? (
                    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm">
                      <span>Bekräfta att bokningen ska avbokas.</span>
                      <Button
                        disabled={busy}
                        onClick={() => void changeStatus(selected, "cancel")}
                        size="sm"
                        variant="destructive"
                      >
                        Bekräfta avbokning
                      </Button>
                      <Button
                        onClick={() => setConfirmingCancel(false)}
                        size="sm"
                        variant="outline"
                      >
                        Behåll bokningen
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
