"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PriceKind = "not_specified" | "fixed" | "from";

function errorMessage(): string {
  return "Ändringen kunde inte sparas. Kontrollera uppgifterna och försök igen.";
}

function serviceDeleteMessage(reason: unknown): string {
  const data =
    typeof reason === "object" && reason !== null && "data" in reason
      ? (reason as { data?: unknown }).data
      : null;
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "SERVICE_IN_USE"
  ) {
    const references =
      "references" in data && Array.isArray(data.references)
        ? data.references
        : [];
    const labels = references.map((reference) =>
      reference === "bookings"
        ? "bokningshistorik"
        : reference === "service_requests"
          ? "förfrågningar"
          : "resurskopplingar",
    );
    return `Tjänsten kan inte tas bort eftersom den används av ${labels.join(
      ", ",
    ) || "verksamhetsdata"}. Inaktivera den i stället.`;
  }
  const message = reason instanceof Error ? reason.message : "";
  if (message.includes("administrator"))
    return "Endast en administratör kan ta bort en tjänst permanent.";
  return "Tjänsten kunde inte tas bort. Inaktivera den om den inte längre ska användas.";
}

function formatPrice(pricing: {
  kind: PriceKind;
  amountMinor?: number;
  currency?: string;
}): string {
  if (pricing.kind === "not_specified") {
    return "Pris ej angivet";
  }

  const amount = (pricing.amountMinor ?? 0) / 100;
  const formatted = new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: pricing.currency,
  }).format(amount);

  return pricing.kind === "from" ? `Från ${formatted}` : formatted;
}

export function CoreDataConsole({ area }: { area: "customers" | "services" }) {
  const { isReady, error: provisioningError } = useTenantProvisioning();
  const customers = useQuery(
    api.customers.list,
    isReady && area === "customers" ? {} : "skip",
  );
  const services = useQuery(
    api.services.list,
    isReady && area === "services" ? {} : "skip",
  );
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerStatus = useMutation(api.customers.setStatus);
  const createService = useMutation(api.services.create);
  const updateService = useMutation(api.services.update);
  const setServiceStatus = useMutation(api.services.setStatus);
  const removeService = useMutation(api.services.remove);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceDuration, setServiceDuration] = useState("");
  const [priceKind, setPriceKind] = useState<PriceKind>("not_specified");
  const [priceAmount, setPriceAmount] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<Id<"services"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPriceKind, setEditPriceKind] = useState<PriceKind>("not_specified");
  const [editPriceAmount, setEditPriceAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("SEK");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const editingService = services?.find((service) => service._id === editingServiceId) ?? null;

  if (!isReady) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {provisioningError ?? "Förbereder arbetsytan…"}
      </p>
    );
  }

  async function addCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await createCustomer({
        name: customerName,
        ...(customerEmail.trim() ? { email: customerEmail } : {}),
        ...(customerPhone.trim() ? { phone: customerPhone } : {}),
      });
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  async function addService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const duration = serviceDuration.trim() ? Number(serviceDuration) : undefined;
    const amountMinor = priceAmount.trim() ? Math.round(Number(priceAmount) * 100) : undefined;

    if (
      (duration !== undefined && !Number.isSafeInteger(duration)) ||
      (priceKind !== "not_specified" &&
        (amountMinor === undefined || !Number.isSafeInteger(amountMinor)))
    ) {
      setError("Ange hela minuter och ett giltigt pris.");
      return;
    }

    setBusy(true);
    try {
      await createService({
        name: serviceName,
        ...(serviceDescription.trim() ? { description: serviceDescription } : {}),
        ...(duration !== undefined ? { durationMinutes: duration } : {}),
        ...(priceKind === "not_specified"
          ? {}
          : {
              pricing: {
                kind: priceKind,
                amountMinor: amountMinor!,
                currency,
              },
            }),
      });
      setServiceName("");
      setServiceDescription("");
      setServiceDuration("");
      setPriceKind("not_specified");
      setPriceAmount("");
      setCurrency("SEK");
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  async function renameCustomer(
    customerId: Id<"customers">,
    currentName: string,
  ) {
    const name = window.prompt("Kundnamn", currentName);

    if (name === null) {
      return;
    }

    try {
      await updateCustomer({ customerId, name });
    } catch {
      setError(errorMessage());
    }
  }

  function openServiceEditor(service: NonNullable<typeof services>[number]) {
    setEditingServiceId(service._id);
    setEditName(service.name);
    setEditDescription(service.description ?? "");
    setEditDuration(service.durationMinutes?.toString() ?? "");
    setEditPriceKind(service.pricing.kind);
    setEditPriceAmount(
      service.pricing.kind === "not_specified"
        ? ""
        : (service.pricing.amountMinor / 100).toFixed(2),
    );
    setEditCurrency(
      service.pricing.kind === "not_specified" ? "SEK" : service.pricing.currency,
    );
    setDeleteBlocked(null);
  }

  async function saveService(event: React.FormEvent) {
    event.preventDefault();
    if (!editingServiceId) return;
    const duration = editDuration.trim() ? Number(editDuration) : null;
    const amountMinor = editPriceAmount.trim()
      ? Math.round(Number(editPriceAmount) * 100)
      : undefined;
    if (
      (duration !== null && !Number.isSafeInteger(duration)) ||
      (editPriceKind !== "not_specified" &&
        (amountMinor === undefined || !Number.isSafeInteger(amountMinor)))
    ) {
      setError("Ange hela minuter och ett giltigt pris.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateService({
        serviceId: editingServiceId,
        name: editName,
        description: editDescription || null,
        durationMinutes: duration,
        pricing:
          editPriceKind === "not_specified"
            ? { kind: "not_specified" }
            : { kind: editPriceKind, amountMinor: amountMinor!, currency: editCurrency },
      });
      setEditingServiceId(null);
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  async function deleteServicePermanently() {
    if (!editingServiceId) return;
    setBusy(true);
    setDeleteBlocked(null);
    try {
      await removeService({ serviceId: editingServiceId });
      setConfirmDelete(false);
      setEditingServiceId(null);
    } catch (reason) {
      setConfirmDelete(false);
      setDeleteBlocked(serviceDeleteMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-4xl gap-6">
      {error !== null ? (
        <p role="alert" className="lg:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {area === "customers" && <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Kundregister</h2>
        <details className="mt-4"><summary className="cursor-pointer py-3 font-medium">Lägg till</summary><form className="mt-4 grid gap-3" onSubmit={addCustomer}>
          <label className="grid min-w-0 gap-2 text-sm">Namn<input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Namn"
            required
            value={customerName}
          /></label>
          <label className="grid min-w-0 gap-2 text-sm">E-post (valfritt)<input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="E-post (valfritt)"
            type="email"
            value={customerEmail}
          /></label>
          <label className="grid min-w-0 gap-2 text-sm">Telefon (valfritt)<input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="Telefon (valfritt)"
            value={customerPhone}
          /></label>
          <button
            className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
            disabled={busy}
            type="submit"
          >
            {busy ? "Sparar…" : "Spara kund"}
          </button>
        </form></details>
        {customers === undefined ? <p role="status" className="mt-4">Laddar kunder…</p> : customers.length === 0 ? <p className="mt-4 text-muted-foreground">Inga kunder ännu.</p> : null}
        <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
          {customers?.map((customer) => (
            <li className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center" key={customer._id}>
              <div>
                <p className="font-medium">{customer.name}</p>
                <p className="text-sm text-zinc-500">
                  {[customer.email, customer.phone].filter(Boolean).join(" · ") ||
                    "Inga kontaktuppgifter"}
                  {customer.status === "active" ? " · Aktiv" : " · Inaktiv"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="min-h-11 px-2 text-sm underline"
                  onClick={() => void renameCustomer(customer._id, customer.name)}
                  type="button"
                >
                  Byt namn
                </button>
                <button
                  className="min-h-11 px-2 text-sm text-red-700 underline dark:text-red-300"
                  onClick={() =>
                    void setCustomerStatus({
                      customerId: customer._id,
                      status:
                        customer.status === "active" ? "inactive" : "active",
                    }).catch(() => setError("Ändringen kunde inte sparas."))
                  }
                  type="button"
                >
                  {customer.status === "active" ? "Inaktivera" : "Aktivera"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>}

      {area === "services" && <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Tjänster</h2>
        <details className="mt-4"><summary className="cursor-pointer py-3 font-medium">Lägg till</summary><form className="mt-4 grid gap-3" onSubmit={addService}>
          <label className="grid min-w-0 gap-2 text-sm">Namn<input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setServiceName(event.target.value)}
            placeholder="Namn"
            required
            value={serviceName}
          /></label>
          <label className="grid min-w-0 gap-2 text-sm">Beskrivning (valfritt)<textarea
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setServiceDescription(event.target.value)}
            placeholder="Beskrivning (valfritt)"
            value={serviceDescription}
          /></label>
          <label className="grid min-w-0 gap-2 text-sm">Tidsåtgång i minuter<input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            min="0"
            onChange={(event) => setServiceDuration(event.target.value)}
            placeholder="Krävs för bokningsbara tjänster"
            type="number"
            value={serviceDuration}
          /></label>
          <select aria-label="Pristyp"
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setPriceKind(event.target.value as PriceKind)}
            value={priceKind}
          >
            <option value="not_specified">Pris ej angivet</option>
            <option value="fixed">Fast pris</option>
            <option value="from">Frånpris</option>
          </select>
          {priceKind !== "not_specified" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid min-w-0 gap-2 text-sm">Pris, t.ex. 99,00<input
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                min="0"
                onChange={(event) => setPriceAmount(event.target.value)}
                placeholder="Pris, t.ex. 99,00" step="0.01"
                required
                type="number"
                value={priceAmount}
              /></label>
              <label className="grid min-w-0 gap-2 text-sm">Valuta<input
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value)}
                placeholder="Valuta"
                required
                value={currency}
              /></label>
            </div>
          ) : null}
          <button
            className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
            disabled={busy}
            type="submit"
          >
            {busy ? "Sparar…" : "Spara tjänst"}
          </button>
        </form></details>
        {services === undefined ? <p role="status" className="mt-4">Laddar tjänster…</p> : services.length === 0 ? <p className="mt-4 text-muted-foreground">Inga tjänster ännu.</p> : null}
        <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
          {services?.map((service) => (
            <li className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center" key={service._id}>
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-zinc-500">
                  {formatPrice(service.pricing)}
                  {service.durationMinutes !== undefined
                    ? ` · ${service.durationMinutes} min`
                    : " · Inte bokningsklar"}
                  {service.status === "active" ? " · Aktiv" : " · Inaktiv"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="min-h-11 px-2 text-sm underline"
                  onClick={() => openServiceEditor(service)}
                  type="button"
                >
                  Redigera
                </button>
                <button
                  className="min-h-11 px-2 text-sm text-red-700 underline dark:text-red-300"
                  onClick={() =>
                    void setServiceStatus({
                      serviceId: service._id,
                      status:
                        service.status === "active" ? "inactive" : "active",
                    }).catch(() => setError("Ändringen kunde inte sparas."))
                  }
                  type="button"
                >
                  {service.status === "active" ? "Inaktivera" : "Aktivera"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>}

      <Dialog
        open={editingService !== null}
        onOpenChange={(open) => !busy && !open && setEditingServiceId(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Redigera tjänst</DialogTitle>
            <DialogDescription>
              Tidsåtgång krävs för bokningsbara tjänster men kan lämnas tom för informationstjänster.
            </DialogDescription>
          </DialogHeader>
          {editingService ? (
            <form className="grid gap-4" onSubmit={saveService}>
              <label className="grid gap-2 text-sm">Namn<input className="rounded-md border px-3 py-2" onChange={(event) => setEditName(event.target.value)} required value={editName} /></label>
              <label className="grid gap-2 text-sm">Beskrivning (valfritt)<textarea className="rounded-md border px-3 py-2" onChange={(event) => setEditDescription(event.target.value)} value={editDescription} /></label>
              <label className="grid gap-2 text-sm">Tidsåtgång i minuter<input className="rounded-md border px-3 py-2" min="0" onChange={(event) => setEditDuration(event.target.value)} placeholder="Krävs för bokningsbara tjänster" type="number" value={editDuration} /></label>
              <select aria-label="Pristyp" className="rounded-md border px-3 py-2" onChange={(event) => setEditPriceKind(event.target.value as PriceKind)} value={editPriceKind}>
                <option value="not_specified">Pris ej angivet</option><option value="fixed">Fast pris</option><option value="from">Frånpris</option>
              </select>
              {editPriceKind !== "not_specified" ? <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm">Pris<input className="rounded-md border px-3 py-2" min="0" onChange={(event) => setEditPriceAmount(event.target.value)} required step="0.01" type="number" value={editPriceAmount} /></label>
                <label className="grid gap-2 text-sm">Valuta<input className="rounded-md border px-3 py-2" maxLength={3} onChange={(event) => setEditCurrency(event.target.value)} required value={editCurrency} /></label>
              </div> : null}
              {deleteBlocked ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <p>{deleteBlocked}</p>
                {editingService.status === "active" ? <Button className="mt-3" onClick={() => void setServiceStatus({ serviceId: editingService._id, status: "inactive" }).then(() => setEditingServiceId(null)).catch(() => setError(errorMessage()))} type="button" variant="outline">Inaktivera i stället</Button> : null}
              </div> : null}
              <DialogFooter className="gap-2 sm:justify-between">
                <Button onClick={() => setConfirmDelete(true)} type="button" variant="destructive">Ta bort tjänst</Button>
                <Button disabled={busy} type="submit">{busy ? "Sparar…" : "Spara ändringar"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => !busy && setConfirmDelete(open)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ta bort tjänsten permanent?</DialogTitle><DialogDescription>Det går bara om tjänsten aldrig har använts av en bokning, förfrågan eller resurskoppling. Åtgärden kan inte ångras.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button disabled={busy} onClick={() => setConfirmDelete(false)} variant="outline">Behåll tjänsten</Button>
            <Button disabled={busy} onClick={() => void deleteServicePermanently()} variant="destructive">{busy ? "Tar bort…" : "Ta bort tjänst"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
