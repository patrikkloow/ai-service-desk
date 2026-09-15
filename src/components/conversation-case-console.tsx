"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

type Channel = "web" | "sms" | "phone" | "email" | "other";
type SenderType = "customer" | "ai" | "human" | "system";
type Priority = "low" | "normal" | "high";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function ConversationCaseConsole() {
  const { isReady } = useTenantProvisioning();
  const customers = useQuery(api.customers.list, isReady ? {} : "skip");
  const conversations = useQuery(api.conversations.list, isReady ? {} : "skip");
  const cases = useQuery(api.cases.list, isReady ? {} : "skip");
  const [selectedConversationId, setSelectedConversationId] = useState<
    Id<"conversations"> | null
  >(null);
  const messages = useQuery(
    api.conversations.listMessages,
    selectedConversationId === null ? "skip" : { conversationId: selectedConversationId },
  );
  const events = useQuery(
    api.conversations.listEvents,
    selectedConversationId === null ? "skip" : { conversationId: selectedConversationId },
  );
  const createConversation = useMutation(api.conversations.create);
  const linkCustomer = useMutation(api.conversations.linkCustomer);
  const resolveConversation = useMutation(api.conversations.resolve);
  const reopenConversation = useMutation(api.conversations.reopen);
  const appendMessage = useMutation(api.conversations.appendMessage);
  const createCase = useMutation(api.cases.create);
  const resolveCase = useMutation(api.cases.resolve);
  const reopenCase = useMutation(api.cases.reopen);
  const [conversationCustomerId, setConversationCustomerId] = useState<
    Id<"customers"> | ""
  >("");
  const [channel, setChannel] = useState<Channel>("web");
  const [subject, setSubject] = useState("");
  const [linkCustomerId, setLinkCustomerId] = useState<Id<"customers"> | "">("");
  const [messageContent, setMessageContent] = useState("");
  const [senderType, setSenderType] = useState<SenderType>("customer");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [casePriority, setCasePriority] = useState<Priority>("normal");
  const [error, setError] = useState<string | null>(null);
  const activeCustomers = customers?.filter(
    (customer) => customer.status === "active",
  );
  const selectedConversation = conversations?.find(
    (conversation) => conversation._id === selectedConversationId,
  );

  async function addConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const conversationId = await createConversation({
        channel,
        ...(conversationCustomerId === ""
          ? {}
          : { customerId: conversationCustomerId }),
        ...(subject.trim() ? { subject } : {}),
      });
      setSelectedConversationId(conversationId);
      setSubject("");
      setConversationCustomerId("");
      setChannel("web");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function addMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedConversationId === null) return;
    setError(null);
    try {
      await appendMessage({
        conversationId: selectedConversationId,
        senderType,
        content: messageContent,
      });
      setMessageContent("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function connectCustomer() {
    if (selectedConversationId === null || linkCustomerId === "") return;
    try {
      await linkCustomer({
        conversationId: selectedConversationId,
        customerId: linkCustomerId,
      });
      setLinkCustomerId("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function changeConversationStatus() {
    if (selectedConversation === undefined) return;
    try {
      if (selectedConversation.status === "open") {
        await resolveConversation({ conversationId: selectedConversation._id });
      } else {
        await reopenConversation({ conversationId: selectedConversation._id });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function addCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedConversationId === null) return;
    try {
      await createCase({
        conversationId: selectedConversationId,
        title: caseTitle,
        ...(caseDescription.trim() ? { description: caseDescription } : {}),
        priority: casePriority,
      });
      setCaseTitle("");
      setCaseDescription("");
      setCasePriority("normal");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function changeCaseStatus(
    caseId: Id<"cases">,
    status: "open" | "resolved",
  ) {
    try {
      if (status === "open") {
        await resolveCase({ caseId });
      } else {
        await reopenCase({ caseId });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 lg:col-span-2 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Conversations and cases</h2>
      {error !== null ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={addConversation}>
        <select
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setChannel(event.target.value as Channel)}
          value={channel}
        >
          <option value="web">Web</option>
          <option value="sms">SMS</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="other">Other</option>
        </select>
        <select
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) =>
            setConversationCustomerId(event.target.value as Id<"customers">)
          }
          value={conversationCustomerId}
        >
          <option value="">Anonymous conversation</option>
          {activeCustomers?.map((customer) => (
            <option key={customer._id} value={customer._id}>
              {customer.name}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject (optional)"
          value={subject}
        />
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white md:col-span-3 dark:bg-zinc-50 dark:text-zinc-950"
          type="submit"
        >
          Create conversation
        </button>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-medium">Recent conversations</h3>
          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {conversations?.map((conversation) => (
              <li className="flex items-center justify-between gap-3 py-3" key={conversation._id}>
                <div>
                  <p className="font-medium">{conversation.subject ?? "Untitled contact"}</p>
                  <p className="text-sm text-zinc-500">
                    {conversation.channel} · {conversation.status}
                  </p>
                </div>
                <button
                  className="text-sm underline"
                  onClick={() => setSelectedConversationId(conversation._id)}
                  type="button"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Conversation detail</h3>
          {selectedConversation === undefined ? (
            <p className="mt-2 text-sm text-zinc-500">Choose a conversation.</p>
          ) : (
            <div className="mt-2 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500">
                  {selectedConversation.customerId === undefined
                    ? "No customer linked"
                    : "Customer linked"}
                </p>
                <button
                  className="text-sm underline"
                  onClick={() => void changeConversationStatus()}
                  type="button"
                >
                  {selectedConversation.status === "open" ? "Resolve" : "Reopen"}
                </button>
              </div>
              {selectedConversation.customerId === undefined ? (
                <div className="flex gap-2">
                  <select
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                    onChange={(event) => setLinkCustomerId(event.target.value as Id<"customers">)}
                    value={linkCustomerId}
                  >
                    <option value="">Link a customer</option>
                    {activeCustomers?.map((customer) => (
                      <option key={customer._id} value={customer._id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <button className="text-sm underline" onClick={() => void connectCustomer()} type="button">
                    Link
                  </button>
                </div>
              ) : null}
              <ul className="space-y-2 text-sm">
                {messages?.map((message) => (
                  <li className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900" key={message._id}>
                    <span className="font-medium">{message.senderType}: </span>
                    {message.content}
                  </li>
                ))}
              </ul>
              <form className="grid gap-2" onSubmit={addMessage}>
                <select
                  className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                  onChange={(event) => setSenderType(event.target.value as SenderType)}
                  value={senderType}
                >
                  <option value="customer">Customer</option>
                  <option value="human">Human</option>
                  <option value="ai">AI</option>
                  <option value="system">System</option>
                </select>
                <textarea
                  className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
                  onChange={(event) => setMessageContent(event.target.value)}
                  placeholder="Test message"
                  required
                  value={messageContent}
                />
                <button className="text-sm underline" type="submit">Add message</button>
              </form>
              <form className="grid gap-2" onSubmit={addCase}>
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
                  onChange={(event) => setCasePriority(event.target.value as Priority)}
                  value={casePriority}
                >
                  <option value="low">Low priority</option>
                  <option value="normal">Normal priority</option>
                  <option value="high">High priority</option>
                </select>
                <button className="text-sm underline" type="submit">Create case</button>
              </form>
              <ul className="space-y-1 text-xs text-zinc-500">
                {events?.map((event) => <li key={event._id}>{event.type}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      <h3 className="mt-6 font-medium">Cases</h3>
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {cases?.map((caseRecord) => (
          <li className="flex items-center justify-between gap-3 py-3" key={caseRecord._id}>
            <div>
              <p className="font-medium">{caseRecord.title}</p>
              <p className="text-sm text-zinc-500">
                {caseRecord.priority} · {caseRecord.status}
              </p>
            </div>
            <button
              className="text-sm underline"
              onClick={() => void changeCaseStatus(caseRecord._id, caseRecord.status)}
              type="button"
            >
              {caseRecord.status === "open" ? "Resolve" : "Reopen"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
