"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

function errorMessage(): string {
  return "Ändringen kunde inte sparas. Kontrollera uppgifterna och försök igen.";
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
  const [busy, setBusy] = useState(false);

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await createEntry({ title, content });
      setTitle("");
      setContent("");
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  async function editEntry(
    knowledgeId: Id<"knowledgeEntries">,
    currentTitle: string,
    currentContent: string,
  ) {
    const nextTitle = window.prompt("Rubrik", currentTitle);
    if (nextTitle === null) return;
    const nextContent = window.prompt("Innehåll", currentContent);
    if (nextContent === null) return;

    try {
      await updateEntry({
        knowledgeId,
        title: nextTitle,
        content: nextContent,
      });
    } catch {
      setError(errorMessage());
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
    } catch {
      setError(errorMessage());
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 lg:col-span-2 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Kunskapsbank</h2>
      {error !== null ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <details className="mt-4"><summary className="cursor-pointer py-3 font-medium">Ny kunskap</summary><form className="mt-4 grid gap-3" onSubmit={addEntry}>
        <label className="grid min-w-0 gap-2 text-sm">Rubrik<input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Rubrik"
          required
          value={title}
        /></label>
        <label className="grid min-w-0 gap-2 text-sm">Företagets kunskap eller riktlinjer<textarea
          className="min-h-28 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          onChange={(event) => setContent(event.target.value)}
          placeholder="Företagets kunskap eller riktlinjer"
          required
          value={content}
        /></label>
        <button
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          disabled={busy}
          type="submit"
        >
          {busy ? "Sparar…" : "Spara kunskap"}
        </button>
      </form></details>
      <label className="grid min-w-0 gap-2 text-sm">Sök i aktiv kunskap<input
        className="mt-5 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Sök i aktiv kunskap"
        type="search"
        value={searchQuery}
      /></label>
      {searchQuery.trim() ? (
        <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <p className="font-medium">Sökresultat</p>
          {searchResults?.length === 0 ? (
            <p className="mt-1 text-zinc-500">Ingen matchande aktiv kunskap.</p>
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
      {entries === undefined ? <p role="status" className="mt-4">Laddar kunskap…</p> : entries.length === 0 ? <p className="mt-4 text-muted-foreground">Ingen kunskap sparad ännu.</p> : null}
      <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
        {entries?.map((entry) => (
          <li className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row" key={entry._id}>
            <div>
              <p className="font-medium">{entry.title}</p>
              <p className="whitespace-pre-wrap text-sm text-zinc-500">{entry.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.status === "active" ? "Aktiv" : "Inaktiv"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                className="min-h-11 px-2 text-sm underline"
                onClick={() => void editEntry(entry._id, entry.title, entry.content)}
                type="button"
              >
                Redigera
              </button>
              <button
                className="min-h-11 px-2 text-sm text-red-700 underline dark:text-red-300"
                onClick={() => void toggleStatus(entry._id, entry.status)}
                type="button"
              >
                {entry.status === "active" ? "Inaktivera" : "Aktivera"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
