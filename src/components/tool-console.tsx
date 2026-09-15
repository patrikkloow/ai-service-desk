"use client";

import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

type ToolName =
  | "knowledge.search"
  | "customer.find"
  | "service.list"
  | "availability.check"
  | "booking.create"
  | "booking.reschedule"
  | "booking.cancel"
  | "case.create"
  | "human.escalate";

type CustomerFindBy = "email" | "phone" | "name";
type CasePriority = "low" | "normal" | "high";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function timestampFromInput(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

function SelectConversation({
  conversations,
  value,
  onChange,
  required = false,
}: {
  conversations: Array<{ _id: Id<"conversations">; subject?: string }> | undefined;
  value: Id<"conversations"> | "";
  onChange: (value: Id<"conversations"> | "") => void;
  required?: boolean;
}) {
  return (
    <select
      className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
      onChange={(event) => onChange(event.target.value as Id<"conversations"> | "")}
      required={required}
      value={value}
    >
      <option value="">{required ? "Choose a conversation" : "No conversation context"}</option>
      {conversations?.map((conversation) => (
        <option key={conversation._id} value={conversation._id}>
          {conversation.subject ?? "Untitled conversation"}
        </option>
      ))}
    </select>
  );
}

export function ToolConsole() {
  const { isReady } = useTenantProvisioning();
  const definitions = useQuery(api.tools.listDefinitions, isReady ? {} : "skip");
  const customers = useQuery(api.customers.list, isReady ? { status: "active" } : "skip");
  const services = useQuery(api.services.list, isReady ? { status: "active" } : "skip");
  const bookings = useQuery(api.bookings.list, isReady ? { status: "confirmed" } : "skip");
  const conversations = useQuery(api.conversations.list, isReady ? {} : "skip");
  const convex = useConvex();
  const executeWrite = useMutation(api.tools.executeWrite);
  const [toolName, setToolName] = useState<ToolName>("knowledge.search");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("5");
  const [customerFindBy, setCustomerFindBy] = useState<CustomerFindBy>("email");
  const [customerFindValue, setCustomerFindValue] = useState("");
  const [customerId, setCustomerId] = useState<Id<"customers"> | "">("");
  const [serviceId, setServiceId] = useState<Id<"services"> | "">("");
  const [bookingId, setBookingId] = useState<Id<"bookings"> | "">("");
  const [conversationId, setConversationId] = useState<Id<"conversations"> | "">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [casePriority, setCasePriority] = useState<CasePriority>("normal");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const definition = definitions?.find((item) => item.name === toolName);

  function optionalConversation() {
    return conversationId === "" ? {} : { conversationId };
  }

  function timeRange() {
    const start = timestampFromInput(startTime);
    const end = timestampFromInput(endTime);
    if (start === null || end === null) {
      throw new Error("Enter valid start and end times.");
    }
    return { startTime: start, endTime: end };
  }

  async function runTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult("");

    try {
      let response;
      switch (toolName) {
        case "knowledge.search": {
          const parsedLimit = limit.trim() ? Number(limit) : undefined;
          response = await convex.query(api.tools.executeRead, {
            request: {
              toolName,
              args: {
                query,
                ...(parsedLimit === undefined ? {} : { limit: parsedLimit }),
              },
            },
          });
          break;
        }
        case "customer.find": {
          const parsedLimit = limit.trim() ? Number(limit) : undefined;
          response = await convex.query(api.tools.executeRead, {
            request: {
              toolName,
              args: {
                by: customerFindBy,
                value: customerFindValue,
                ...(parsedLimit === undefined ? {} : { limit: parsedLimit }),
              },
            },
          });
          break;
        }
        case "service.list":
          response = await convex.query(api.tools.executeRead, { request: { toolName, args: {} } });
          break;
        case "availability.check":
          response = await convex.query(api.tools.executeRead, { request: { toolName, args: timeRange() } });
          break;
        case "booking.create":
          if (customerId === "" || serviceId === "") {
            throw new Error("Choose a customer and service.");
          }
          response = await executeWrite({
            request: {
              toolName,
              args: {
                customerId,
                serviceId,
                ...timeRange(),
                ...(notes.trim() ? { notes } : {}),
                ...optionalConversation(),
              },
            },
          });
          break;
        case "booking.reschedule":
          if (bookingId === "") throw new Error("Choose a booking.");
          response = await executeWrite({
            request: {
              toolName,
              args: { bookingId, ...timeRange(), ...optionalConversation() },
            },
          });
          break;
        case "booking.cancel":
          if (bookingId === "") throw new Error("Choose a booking.");
          response = await executeWrite({
            request: { toolName, args: { bookingId, ...optionalConversation() } },
          });
          break;
        case "case.create":
          response = await executeWrite({
            request: {
              toolName,
              args: {
                title: caseTitle,
                ...(caseDescription.trim() ? { description: caseDescription } : {}),
                priority: casePriority,
                ...(customerId === "" ? {} : { customerId }),
                ...optionalConversation(),
              },
            },
          });
          break;
        case "human.escalate":
          if (conversationId === "") throw new Error("Choose a conversation.");
          response = await executeWrite({
            request: { toolName, args: { conversationId, reason } },
          });
          break;
      }
      setResult(JSON.stringify(response, null, 2));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 lg:col-span-2 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Approved tool console</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Development-only execution surface. It sends no tenant, user, or role fields.
      </p>
      {error !== null ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <form className="mt-4 grid gap-3" onSubmit={runTool}>
        <select
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setToolName(event.target.value as ToolName)}
          value={toolName}
        >
          {definitions?.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.kind})
            </option>
          ))}
        </select>
        {definition !== undefined ? (
          <p className="text-sm text-zinc-500">{definition.description}</p>
        ) : null}

        {toolName === "knowledge.search" ? (
          <>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Knowledge search query"
              required
              value={query}
            />
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              min="1"
              max="10"
              onChange={(event) => setLimit(event.target.value)}
              placeholder="Result limit"
              type="number"
              value={limit}
            />
          </>
        ) : null}

        {toolName === "customer.find" ? (
          <>
            <select
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCustomerFindBy(event.target.value as CustomerFindBy)}
              value={customerFindBy}
            >
              <option value="email">Exact email</option>
              <option value="phone">Exact phone</option>
              <option value="name">Exact name</option>
            </select>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCustomerFindValue(event.target.value)}
              placeholder="Exact customer identifier"
              required
              value={customerFindValue}
            />
          </>
        ) : null}

        {toolName === "availability.check" || toolName === "booking.create" || toolName === "booking.reschedule" ? (
          <div className="grid gap-3 md:grid-cols-2">
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
          </div>
        ) : null}

        {toolName === "booking.create" ? (
          <>
            <select
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCustomerId(event.target.value as Id<"customers">)}
              required
              value={customerId}
            >
              <option value="">Choose a customer</option>
              {customers?.map((customer) => (
                <option key={customer._id} value={customer._id}>{customer.name}</option>
              ))}
            </select>
            <select
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setServiceId(event.target.value as Id<"services">)}
              required
              value={serviceId}
            >
              <option value="">Choose a service</option>
              {services?.map((service) => (
                <option key={service._id} value={service._id}>{service.name}</option>
              ))}
            </select>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes (optional)"
              value={notes}
            />
          </>
        ) : null}

        {toolName === "booking.reschedule" || toolName === "booking.cancel" ? (
          <select
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
            onChange={(event) => setBookingId(event.target.value as Id<"bookings">)}
            required
            value={bookingId}
          >
            <option value="">Choose a confirmed booking</option>
            {bookings?.map((booking) => (
              <option key={booking._id} value={booking._id}>
                {booking.customerName} · {booking.serviceName}
              </option>
            ))}
          </select>
        ) : null}

        {toolName === "booking.create" || toolName === "booking.reschedule" || toolName === "booking.cancel" || toolName === "case.create" ? (
          <SelectConversation
            conversations={conversations}
            onChange={setConversationId}
            value={conversationId}
          />
        ) : null}

        {toolName === "case.create" ? (
          <>
            <select
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCustomerId(event.target.value as Id<"customers">)}
              value={customerId}
            >
              <option value="">No customer context</option>
              {customers?.map((customer) => (
                <option key={customer._id} value={customer._id}>{customer.name}</option>
              ))}
            </select>
            <input
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCaseTitle(event.target.value)}
              placeholder="Case title"
              required
              value={caseTitle}
            />
            <textarea
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCaseDescription(event.target.value)}
              placeholder="Case description (optional)"
              value={caseDescription}
            />
            <select
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setCasePriority(event.target.value as CasePriority)}
              value={casePriority}
            >
              <option value="low">Low priority</option>
              <option value="normal">Normal priority</option>
              <option value="high">High priority</option>
            </select>
          </>
        ) : null}

        {toolName === "human.escalate" ? (
          <>
            <SelectConversation
              conversations={conversations}
              onChange={setConversationId}
              required
              value={conversationId}
            />
            <textarea
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for human follow-up"
              required
              value={reason}
            />
          </>
        ) : null}

        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          type="submit"
        >
          Execute approved tool
        </button>
      </form>
      {result ? (
        <pre className="mt-4 overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">
          {result}
        </pre>
      ) : null}
    </section>
  );
}
