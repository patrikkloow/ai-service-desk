"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BookingConsole } from "./booking-console";
import { KnowledgeConsole } from "./knowledge-console";
import { useTenantProvisioning } from "./tenant-bootstrap";

type PriceKind = "not_specified" | "fixed" | "from";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatPrice(pricing: {
  kind: PriceKind;
  amountMinor?: number;
  currency?: string;
}): string {
  if (pricing.kind === "not_specified") {
    return "Price not specified";
  }

  const amount = (pricing.amountMinor ?? 0) / 100;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: pricing.currency,
  }).format(amount);

  return pricing.kind === "from" ? `From ${formatted}` : formatted;
}

export function CoreDataConsole() {
  const { isReady, error: provisioningError } = useTenantProvisioning();
  const customers = useQuery(
    api.customers.list,
    isReady ? {} : "skip",
  );
  const services = useQuery(
    api.services.list,
    isReady ? {} : "skip",
  );
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerStatus = useMutation(api.customers.setStatus);
  const createService = useMutation(api.services.create);
  const updateService = useMutation(api.services.update);
  const setServiceStatus = useMutation(api.services.setStatus);
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

  if (!isReady) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {provisioningError ?? "Preparing your active workspace…"}
      </p>
    );
  }

  async function addCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await createCustomer({
        name: customerName,
        ...(customerEmail.trim() ? { email: customerEmail } : {}),
        ...(customerPhone.trim() ? { phone: customerPhone } : {}),
      });
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function addService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const duration = serviceDuration.trim() ? Number(serviceDuration) : undefined;
    const amountMinor = priceAmount.trim() ? Number(priceAmount) : undefined;

    if (
      (duration !== undefined && !Number.isSafeInteger(duration)) ||
      (priceKind !== "not_specified" &&
        (amountMinor === undefined || !Number.isSafeInteger(amountMinor)))
    ) {
      setError("Duration and price must be whole numbers.");
      return;
    }

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
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function renameCustomer(
    customerId: Id<"customers">,
    currentName: string,
  ) {
    const name = window.prompt("Customer name", currentName);

    if (name === null) {
      return;
    }

    try {
      await updateCustomer({ customerId, name });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function renameService(
    serviceId: Id<"services">,
    currentName: string,
  ) {
    const name = window.prompt("Service name", currentName);

    if (name === null) {
      return;
    }

    try {
      await updateService({ serviceId, name });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {error !== null ? (
        <p className="lg:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Customers</h2>
        <form className="mt-4 grid gap-3" onSubmit={addCustomer}>
          <input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Name"
            required
            value={customerName}
          />
          <input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="Email (optional)"
            type="email"
            value={customerEmail}
          />
          <input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="Phone (optional)"
            value={customerPhone}
          />
          <button
            className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
            type="submit"
          >
            Add customer
          </button>
        </form>
        <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
          {customers?.map((customer) => (
            <li className="flex items-center justify-between gap-3 py-3" key={customer._id}>
              <div>
                <p className="font-medium">{customer.name}</p>
                <p className="text-sm text-zinc-500">
                  {[customer.email, customer.phone].filter(Boolean).join(" · ") ||
                    "No contact details"}
                  {` · ${customer.status}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="text-sm underline"
                  onClick={() => void renameCustomer(customer._id, customer.name)}
                  type="button"
                >
                  Rename
                </button>
                <button
                  className="text-sm text-red-700 underline dark:text-red-300"
                  onClick={() =>
                    void setCustomerStatus({
                      customerId: customer._id,
                      status:
                        customer.status === "active" ? "inactive" : "active",
                    })
                  }
                  type="button"
                >
                  {customer.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Services</h2>
        <form className="mt-4 grid gap-3" onSubmit={addService}>
          <input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setServiceName(event.target.value)}
            placeholder="Name"
            required
            value={serviceName}
          />
          <textarea
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setServiceDescription(event.target.value)}
            placeholder="Description (optional)"
            value={serviceDescription}
          />
          <input
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            min="0"
            onChange={(event) => setServiceDuration(event.target.value)}
            placeholder="Duration in minutes (optional)"
            type="number"
            value={serviceDuration}
          />
          <select
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setPriceKind(event.target.value as PriceKind)}
            value={priceKind}
          >
            <option value="not_specified">Price not specified</option>
            <option value="fixed">Fixed price</option>
            <option value="from">From price</option>
          </select>
          {priceKind !== "not_specified" ? (
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                min="0"
                onChange={(event) => setPriceAmount(event.target.value)}
                placeholder="Minor units, e.g. 9900"
                required
                type="number"
                value={priceAmount}
              />
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value)}
                placeholder="Currency"
                required
                value={currency}
              />
            </div>
          ) : null}
          <button
            className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
            type="submit"
          >
            Add service
          </button>
        </form>
        <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
          {services?.map((service) => (
            <li className="flex items-center justify-between gap-3 py-3" key={service._id}>
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-zinc-500">
                  {formatPrice(service.pricing)}
                  {service.durationMinutes !== undefined
                    ? ` · ${service.durationMinutes} min`
                    : ""}
                  {` · ${service.status}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="text-sm underline"
                  onClick={() => void renameService(service._id, service.name)}
                  type="button"
                >
                  Rename
                </button>
                <button
                  className="text-sm text-red-700 underline dark:text-red-300"
                  onClick={() =>
                    void setServiceStatus({
                      serviceId: service._id,
                      status:
                        service.status === "active" ? "inactive" : "active",
                    })
                  }
                  type="button"
                >
                  {service.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <BookingConsole />
      <KnowledgeConsole />
    </div>
  );
}
