"use client";

import { Component, type ReactNode, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTenantProvisioning } from "./tenant-bootstrap";

import { Button } from "@/components/ui/button";
import { Badge as StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

type Target = Id<"serviceRequests"> | Id<"cases">;
const actions = {
  ask_customer: "Fråga kunden",
  book_assessment: "Planera en bedömning med kunden",
  human_review: "Gå igenom kundens behov",
  wait: "Invänta svar",
  none: "Ingen åtgärd",
};
const statuses = {
  new: "Ny",
  active: "Pågående",
  scheduled: "Bokad",
  completed: "Slutförd",
  cancelled: "Avbruten",
  open: "Öppet",
  resolved: "Avslutat",
};
const attentionLabels = {
  requested: "Behöver hjälp",
  acknowledged: "Omhändertaget",
  resolved: "Hanterat",
  none: "Ingen uppföljning",
};
const field =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";
function date(value: number) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

class InboxError extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert" className="py-8">
        Inkorgen kunde inte laddas. Ladda om sidan och försök igen.
      </p>
    ) : (
      this.props.children
    );
  }
}
export function Inbox({ requestsOnly = false, initialSelected = null }: { requestsOnly?: boolean; initialSelected?: string | null }) {
  const { orgId, userId } = useAuth();
  const { isReady, error } = useTenantProvisioning();
  if (!isReady)
    return (
      <p className="py-8" role="status">
        {error ? "Arbetsytan kunde inte laddas." : "Förbereder din arbetsyta…"}
      </p>
    );
  // Clear detail, drafts and pending errors on workspace/account changes.
  return (
    <InboxError key={`${orgId}:${userId}`}>
      <InboxContent requestsOnly={requestsOnly} initialSelected={initialSelected} />
    </InboxError>
  );
}
function InboxContent({ requestsOnly, initialSelected }: { requestsOnly: boolean; initialSelected: string | null }) {
  const [view, setView] = useState<"attention" | "all">(requestsOnly ? "all" : "attention");
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const focusAfterClose = useRef<Target | null>(null);
  const data = useQuery(api.inbox.list, { view });
  const rows = data?.items.filter(row => !requestsOnly || row.kind === "request");
  const selected = rows?.find((row) => row.id === initialSelected)?.id ?? null;

  useEffect(() => {
    if (data !== undefined && initialSelected !== null && selected === null) {
      router.replace(pathname, { scroll: false });
    }
  }, [data, initialSelected, pathname, router, selected]);

  useEffect(() => {
    if (selected !== null || focusAfterClose.current === null) return;
    const previous = focusAfterClose.current;
    focusAfterClose.current = null;
    document.getElementById(`request-${previous}`)?.focus();
  }, [selected]);

  function select(target: Target) {
    router.push(`${pathname}?selected=${encodeURIComponent(target)}`, {
      scroll: false,
    });
  }

  function closeDetail() {
    focusAfterClose.current = selected;
    router.replace(pathname, { scroll: false });
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{requestsOnly ? "Förfrågningar" : "Inkorg"}</h1>
          <p className="mt-1 text-zinc-500">
            {requestsOnly ? "Kundernas önskemål, från första kontakt till klart." : "Vad behöver din hjälp just nu?"}
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild><Button>Ny förfrågan</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>Ny förfrågan</DialogTitle><DialogDescription>Beskriv vad kunden behöver. Du kan komplettera senare.</DialogDescription></DialogHeader>
            <CreateRequest onDone={(id) => { select(id); setCreating(false); }} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrera listan">
        <Button
          variant={view === "attention" ? "secondary" : "ghost"}
          aria-pressed={view === "attention"}
          onClick={() => setView("attention")}
        >
          Behöver hjälp
        </Button>
        <Button
          variant={view === "all" ? "secondary" : "ghost"}
          aria-pressed={view === "all"}
          onClick={() => setView("all")}
        >
          {requestsOnly ? "Alla förfrågningar" : "Alla"}
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
        <div className={`min-w-0 overflow-hidden rounded-xl border bg-card ${selected ? "hidden lg:block" : ""}`}>
          {data === undefined ? (
            <p className="p-6" role="status">
              Laddar inkorgen…
            </p>
          ) : rows?.length === 0 ? (
            <p className="p-6 text-zinc-500">
              {view === "attention"
                ? "Inget väntar på din hjälp just nu."
                : "Här visas dina förfrågningar och uppföljningar."}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows?.map((row) => (
                <li key={row.id}>
                  <button
                    aria-pressed={selected === row.id}
                    className={`w-full space-y-2 p-5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 ${selected === row.id ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}
                    id={`request-${row.id}`}
                    onClick={() => select(row.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-zinc-500">
                        {row.customerId ? row.customer : "Ingen kund kopplad"}
                      </span>
                      <Badge state={row.attention} />
                      {row.priority === "high" && (
                        <span className="text-xs font-medium text-red-700">
                          Prioriterat
                        </span>
                      )}
                    </div>
                    <p className="font-semibold">{row.title}</p>
                    {row.preview && (
                      <p className="line-clamp-2 text-sm text-zinc-500">
                        {row.preview}
                      </p>
                    )}
                    <p className="text-sm">{actions[row.nextAction]}</p>
                    {row.reason && (
                      <p className="line-clamp-2 text-sm text-zinc-500">
                        {row.reason}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500">
                      {row.kind === "request" ? "Förfrågan" : "Uppföljning"} ·{" "}
                      {date(row.updatedAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data?.limited && (
            <p className="p-4 text-sm text-zinc-500">
              Visar ett begränsat urval av de senaste förfrågningarna och uppföljningarna.
            </p>
          )}
        </div>
        {selected ? (
          <Detail key={selected} target={selected} onBack={closeDetail} />
        ) : (
          <div className="hidden lg:block rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
            Välj en förfrågan för sammanfattning och nästa steg.
          </div>
        )}
      </div>
    </section>
  );
}
function Badge({ state }: { state: string }) {
  return (
    <StatusBadge variant="secondary"
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${state === "requested" ? "bg-amber-100 text-amber-950" : state === "acknowledged" ? "bg-blue-100 text-blue-950" : "bg-zinc-100 text-zinc-700"}`}
    >
      {attentionLabels[state as keyof typeof attentionLabels]}
    </StatusBadge>
  );
}
function CreateRequest({
  onDone,
}: {
  onDone: (id: Id<"serviceRequests">) => void;
}) {
  const create = useMutation(api.serviceRequests.create);
  const conversations = useQuery(api.conversations.list, {});
  const customers = useQuery(api.customers.list, {});
  const services = useQuery(api.services.list, {});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          const id = await create({
            title: String(form.get("title")),
            summary: {
              wants: String(form.get("title")),
              known: String(form.get("note") || ""),
              missing: "",
            },
            ...(form.get("conversation") ? {initialConversationId: String(form.get("conversation")) as Id<"conversations">} : {}),
            ...(form.get("customer")
              ? { customerId: String(form.get("customer")) as Id<"customers"> }
              : {}),
            ...(form.get("service")
              ? { serviceId: String(form.get("service")) as Id<"services"> }
              : {}),
          });
          onDone(id);
        } catch {
          setError(
            "Förfrågan kunde inte sparas. Kontrollera uppgifterna och försök igen.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="grid gap-2 text-sm font-medium">
        Vad behöver kunden hjälp med?
        <Input name="title" required maxLength={200} placeholder="Beskriv behovet kort" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Anteckning (valfritt)
        <Textarea name="note" maxLength={1000} placeholder="Det ni redan vet eller har kommit överens om" />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          Kund
          <select className={field} name="customer">
            <option value="">Ingen kund kopplad</option>
            {customers?.filter((c) => c.status === "active").map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tjänst
          <select className={field} name="service">
            <option value="">Ej vald</option>
            {services?.filter((s) => s.status === "active").map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details><summary className="cursor-pointer py-2 text-sm">Mer information</summary><label className="mt-2 grid gap-2 text-sm">Koppla befintligt samtal<select className={field} name="conversation"><option value="">Inget samtal</option>{conversations?.map(c => <option key={c._id} value={c._id}>{c.subject || "Samtal"} · {date(c.updatedAt)}</option>)}</select></label><p className="mt-2 text-xs text-muted-foreground">Kunden hämtas från samtalet om ingen kund väljs ovan.</p></details>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button disabled={busy}>
        {busy ? "Sparar…" : "Skapa förfrågan"}
      </Button>
    </form>
  );
}
function Detail({ target, onBack }: { target: Target; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const data = useQuery(api.inbox.detail, { target });
  const bookings = useQuery(api.bookings.list, {});
  const customers = useQuery(api.customers.list, {});
  const services = useQuery(api.services.list, {});
  const attention = useMutation(api.serviceRequests.attention);
  const update = useMutation(api.serviceRequests.update);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice("Ändringen är sparad.");
    } catch {
      setError(
        "Ändringen kunde inte sparas. Förfrågan kan ha ändrats av en kollega. Kontrollera aktuell status.",
      );
    } finally {
      setBusy(false);
    }
  }
  const loaded = data !== undefined;
  useEffect(() => { if (loaded) heading.current?.focus(); }, [loaded]);
  if (!data) return <p role="status">Laddar förfrågan…</p>;
  const contact = customers?.find(customer => customer._id === data.customerId);
  const active =
    data.attention === "requested" || data.attention === "acknowledged";
  return (
    <article className="min-w-0 space-y-6 rounded-xl border bg-card p-4 sm:p-6">
      <Button variant="ghost" className="lg:hidden" onClick={onBack}>← Tillbaka till listan</Button>
      <header>
        <div className="mb-3 flex items-center gap-3">
          <Badge state={data.attention} />
          <span className="text-sm text-zinc-500">{statuses[data.status]}</span>
        </div>
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">{data.title}</h2>
        <p className="mt-1 text-zinc-500">
          {data.customerId ? data.customer : "Ingen kund kopplad"} · {date(data.updatedAt)}
        </p>
      </header>
      <div className="rounded-lg bg-amber-50 p-4 text-amber-950">
        <p className="font-medium">Nästa steg: {actions[data.nextAction]}</p>
        <p className="mt-1 text-sm">
          {data.reason || "Ingen särskild anledning angiven."}
        </p>
      </div>
      <div className="space-y-3 rounded-lg border bg-background p-4">
        <p className="text-sm">
          {data.ownership === "mine"
            ? "Du har tagit hand om detta."
            : data.ownership === "colleague"
              ? "En kollega har tagit hand om detta."
              : "Ingen har bekräftat än."}
        </p>
        <div className="flex flex-wrap gap-2">
          {active && (
            <>
              {data.ownership === "unassigned" && <Button
                variant="default"
                className="w-full sm:w-auto"
                disabled={busy || data.ownership !== "unassigned"}
                onClick={() =>
                  void run(() => attention({ target, action: "acknowledge" }))
                }
              >
                Jag tar hand om detta
              </Button>}
              <Button
                variant={data.ownership === "unassigned" ? "outline" : "default"}
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() =>
                  void run(() => attention({ target, action: "resolve" }))
                }
              >
                {data.kind === "case"
                  ? "Avsluta uppföljning"
                  : "Markera hjälpen som klar"}
              </Button>
            </>
          )}
          {!active && data.kind === "request" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  attention({
                    target,
                    action: "request",
                    reason: "Ny uppföljning behövs",
                  }),
                )
              }
            >
              Begär uppföljning
            </Button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Bekräftelsen fördelar arbetet. Den pausar eller återstartar inte
          automatiska svar.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      )}
      <section className="space-y-4">
        <h3 className="font-semibold">Sammanfattning</h3>
        <p className="text-xs text-zinc-500">
          Bygger på sparade uppgifter och registrerade händelser.
        </p>
        {[
          ["Kundens önskemål", data.summary.wants],
          ["Det vi vet", data.summary.known],
          ["Det som saknas", data.summary.missing],
          ["Det som redan gjorts", data.done.join(" · ")],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-500">
              {value || "Inga uppgifter registrerade."}
            </p>
          </div>
        ))}
      </section>
      <section><h3 className="font-semibold">Kundkontakt</h3><p className="mt-2 text-sm text-muted-foreground">{data.customerId ? data.customer : "Ingen kund kopplad"}</p>{contact && <p className="mt-1 break-words text-sm">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "Inga kontaktuppgifter registrerade."}</p>}</section>
      {data.bookings.length > 0 && (
        <section>
          <h3 className="font-semibold">Bokningar</h3>
          {data.bookings.map((b) => (
            <p className="mt-2 text-sm" key={b.id}>
              {b.service} · {date(b.startTime)} ·{" "}
              {b.status === "confirmed"
                ? "Bekräftad"
                : b.status === "cancelled"
                  ? "Avbokad"
                  : "Genomförd"}
            </p>
          ))}
        </section>
      )}
      {data.cases.length > 0 && (
        <section>
          <h3 className="font-semibold">Kopplad uppföljning</h3>
          {data.cases.map((c) => (
            <p className="mt-2 text-sm" key={c.id}>
              {c.title} · {statuses[c.status]}
            </p>
          ))}
        </section>
      )}
      <section>
        <h3 className="font-semibold">Samtalshistorik</h3>
        {data.hasOlderMessages && (
          <p className="text-xs text-zinc-500">
            Visar de 50 senaste meddelandena.
          </p>
        )}
        {data.messages.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Inga meddelanden att visa.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {data.messages.map((m) => (
              <li
                key={m.id}
                className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"
              >
                <p className="text-xs text-zinc-500">
                  {
                    {
                      customer: "Kund",
                      human: "Medarbetare",
                      ai: "AI",
                      system: "System",
                    }[m.sender]
                  }{" "}
                  · {date(m.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {m.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
      {data.kind === "request" && (
        <details className="border-t pt-4"><summary className="cursor-pointer py-2 font-medium">Redigera förfrågan</summary>
        <form
          key={`${data.id}:${data.updatedAt}`}
          className="grid gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void run(() =>
              update({
                requestId: target as Id<"serviceRequests">,
                summary: {
                  wants: String(form.get("wants")),
                  known: String(form.get("known")),
                  missing: String(form.get("missing")),
                },
                status: String(form.get("status")) as
                  "new" | "active" | "scheduled" | "completed" | "cancelled",
                nextAction: String(
                  form.get("nextAction"),
                ) as keyof typeof actions,
                ...(form.get("booking")
                  ? { bookingId: String(form.get("booking")) as Id<"bookings"> }
                  : {}),
                ...(form.get("customer")
                  ? {
                      customerId: String(
                        form.get("customer"),
                      ) as Id<"customers">,
                    }
                  : {}),
                ...(form.get("service")
                  ? { serviceId: String(form.get("service")) as Id<"services"> }
                  : {}),
              }),
            );
          }}
        >
          <div>
            <div className="mt-3 space-y-3">
              {[
                ["wants", "Kundens önskemål"],
                ["known", "Det vi vet"],
                ["missing", "Det som saknas"],
              ].map(([name, label]) => (
                <label className="block text-sm" key={name}>
                  {label}
                  <Textarea
                    className={field}
                    name={name}
                    required={name === "wants"}
                    maxLength={1000}
                    defaultValue={
                      data.summary[name as keyof typeof data.summary]
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          {!data.customerId && (
            <label className="text-sm">
              Koppla kund
              <select name="customer" className={field}>
                <option value="">Ingen kund kopplad</option>
                {customers?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            Tjänst
            <select
              name="service"
              className={field}
              defaultValue={data.serviceId || ""}
            >
              <option value="">
                {data.serviceId ? "Behåll nuvarande tjänst" : "Ingen tjänst vald"}
              </option>
              {services?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Koppla bokning
            <select
              name="booking"
              className={field}
              defaultValue={data.bookingId || ""}
            >
              <option value="">Behåll nuvarande koppling</option>
              {bookings
                ?.filter(
                  (b) =>
                    b.customerId === data.customerId &&
                    (!data.serviceId || b.serviceId === data.serviceId),
                )
                .map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.serviceName} · {date(b.startTime)}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Arbetsstatus
            <select name="status" className={field} defaultValue={data.status}>
              {(
                [
                  "new",
                  "active",
                  "scheduled",
                  "completed",
                  "cancelled",
                ] as const
              ).map((s) => (
                <option key={s} value={s}>
                  {statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Nästa steg
            <select
              name="nextAction"
              className={field}
              defaultValue={data.nextAction}
            >
              {Object.entries(actions).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-zinc-500">
            Markera hjälpen som klar innan arbetet avslutas. Bokad kräver en
            kopplad bekräftad bokning. Avslutat arbete återöppnas som Pågående.
          </p>
          <Button variant="outline" disabled={busy}>
            Spara
          </Button>
        </form>
        </details>
      )}
    </article>
  );
}
