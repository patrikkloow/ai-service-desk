"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function KnowledgeConsole() {
  const { isReady } = useTenantProvisioning();
  const entries = useQuery(api.knowledge.list, isReady ? {} : "skip");
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useQuery(
    api.knowledge.search,
    isReady && searchQuery.trim() ? { query: searchQuery } : "skip",
  );
  const createEntry = useMutation(api.knowledge.create);
  const updateEntry = useMutation(api.knowledge.update);
  const setStatus = useMutation(api.knowledge.setStatus);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await createEntry({ title, content });
      setTitle("");
      setContent("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function editEntry(
    knowledgeId: Id<"knowledgeEntries">,
    currentTitle: string,
    currentContent: string,
  ) {
    const nextTitle = window.prompt("Knowledge title", currentTitle);
    if (nextTitle === null) return;
    const nextContent = window.prompt("Knowledge content", currentContent);
    if (nextContent === null) return;

    try {
      await updateEntry({
        knowledgeId,
        title: nextTitle,
        content: nextContent,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function toggleStatus(
    knowledgeId: Id<"knowledgeEntries">,
    status: "active" | "inactive",
  ) {
    try {
      await setStatus({
        knowledgeId,
        status: status === "active" ? "inactive" : "active",
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 lg:col-span-2 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Knowledge base</h2>
      {error !== null ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <form className="mt-4 grid gap-3" onSubmit={addEntry}>
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          required
          value={title}
        />
        <textarea
          className="min-h-28 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setContent(event.target.value)}
          placeholder="Business knowledge or policy"
          required
          value={content}
        />
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          type="submit"
        >
          Add knowledge entry
        </button>
      </form>
      <input
        className="mt-5 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search active knowledge"
        type="search"
        value={searchQuery}
      />
      {searchQuery.trim() ? (
        <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <p className="font-medium">Search results</p>
          {searchResults?.length === 0 ? (
            <p className="mt-1 text-zinc-500">No matching active knowledge.</p>
          ) : null}
          <ul className="mt-2 space-y-2">
            {searchResults?.map((entry) => (
              <li key={entry.knowledgeId}>
                <p className="font-medium">{entry.title}</p>
                <p className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  {entry.content}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
        {entries?.map((entry) => (
          <li className="flex items-start justify-between gap-3 py-3" key={entry._id}>
            <div>
              <p className="font-medium">{entry.title}</p>
              <p className="whitespace-pre-wrap text-sm text-zinc-500">{entry.content}</p>
              <p className="mt-1 text-xs text-zinc-400">{entry.status}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="text-sm underline"
                onClick={() => void editEntry(entry._id, entry.title, entry.content)}
                type="button"
              >
                Edit
              </button>
              <button
                className="text-sm text-red-700 underline dark:text-red-300"
                onClick={() => void toggleStatus(entry._id, entry.status)}
                type="button"
              >
                {entry.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
