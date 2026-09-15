"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function AiOrchestratorConsole() {
  const { isReady } = useTenantProvisioning();
  const conversations = useQuery(api.conversations.list, isReady ? {} : "skip");
  const [conversationId, setConversationId] = useState<Id<"conversations"> | "">("");
  const messages = useQuery(
    api.conversations.listMessages,
    conversationId === "" ? "skip" : { conversationId },
  );
  const processCustomerMessage = useAction(api.orchestrator.processCustomerMessage);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendToAi(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (conversationId === "") return;
    setError(null);
    setStatus(null);
    try {
      const result = await processCustomerMessage({ conversationId, message });
      if (result.ok) {
        setStatus(
          `Development fake mode completed. Tools: ${
            result.executedTools.length === 0
              ? "none"
              : result.executedTools.map((tool) => tool.name).join(", ")
          }.`,
        );
        setMessage("");
      } else {
        setError(result.error.message);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/50 p-5 lg:col-span-2 dark:border-amber-800 dark:bg-amber-950/20">
      <h2 className="text-lg font-semibold">AI orchestrator — development fake mode</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        This console does not use a live AI provider. It is isolated development behavior and never represents a real business answer.
      </p>
      {error !== null ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {status !== null ? (
        <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
          {status}
        </p>
      ) : null}
      <form className="mt-4 grid gap-3" onSubmit={sendToAi}>
        <select
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setConversationId(event.target.value as Id<"conversations">)}
          required
          value={conversationId}
        >
          <option value="">Choose a conversation</option>
          {conversations?.map((conversation) => (
            <option key={conversation._id} value={conversation._id}>
              {conversation.subject ?? "Untitled conversation"}
            </option>
          ))}
        </select>
        <textarea
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          maxLength={4000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Customer message"
          required
          value={message}
        />
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          type="submit"
        >
          Send to development fake AI
        </button>
      </form>
      {conversationId !== "" ? (
        <ul className="mt-5 space-y-2 text-sm">
          {messages?.map((item) => (
            <li className="rounded-md bg-white p-3 dark:bg-zinc-900" key={item._id}>
              <span className="font-medium">{item.senderType}: </span>
              {item.content}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
