"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { Button } from "@/components/ui/button";

const actions = [
  ["bookingCreate", "Skapa bokning", "Boka en ny tid."],
  ["bookingReschedule", "Boka om", "Flytta en befintlig bokning."],
  ["bookingCancel", "Avboka", "Avboka en befintlig bokning."],
  ["caseCreate", "Skapa uppföljning", "Skapa ett ärende för personalen."],
] as const;
const decisions = [
  ["allow", "AI får utföra direkt"],
  ["confirm", "Be kunden bekräfta"],
  ["human", "Kräver människa"],
] as const;
type PolicyData = NonNullable<
  ReturnType<typeof useQuery<typeof api.aiPolicy.get>>
>;
type PolicyFormValue = Pick<
  NonNullable<PolicyData["policy"]>,
  "actions" | "responseLanguage" | "communicationTone"
>;

function copyPolicy(policy: PolicyFormValue): PolicyFormValue {
  return { ...policy, actions: { ...policy.actions } };
}

function PolicyForm({ data }: { data: PolicyData }) {
  const update = useMutation(api.aiPolicy.update);
  const initial = copyPolicy(data.policy!);
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedChangesWarning(data.canEdit && dirty);

  function change(next: PolicyFormValue) {
    setForm(next);
    setStatus(null);
  }

  function reset() {
    setForm(copyPolicy(saved));
    setStatus(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setStatus(null);
    try {
      await update(form);
      setSaved(copyPolicy(form));
      setStatus({ kind: "success", text: "Ändringarna är sparade." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Kunde inte spara.",
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      className="max-w-3xl space-y-5"
      data-unsaved={dirty || undefined}
      onSubmit={save}
    >
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="font-semibold">Åtgärder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reglerna kontrolleras på servern innan något ändras. Att be om
          mänsklig hjälp är alltid möjligt.
        </p>
        {!data.canEdit ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Du kan läsa reglerna. Endast en administratör kan ändra dem.
          </p>
        ) : null}
        <div className="mt-5 divide-y">
          {actions.map(([key, label, copy]) => (
            <div
              className="grid gap-3 py-4 sm:grid-cols-[1fr_16rem] sm:items-start"
              key={key}
            >
              <div>
                <label className="block font-medium" htmlFor={`policy-${key}`}>
                  {label}
                </label>
                <p className="text-sm text-muted-foreground">{copy}</p>
              </div>
              <div className="space-y-2">
                <select
                  className="min-h-11 rounded-lg border bg-background px-3 text-sm"
                  disabled={!data.canEdit}
                  id={`policy-${key}`}
                  onChange={(event) =>
                    change({
                      ...form,
                      actions: {
                        ...form.actions,
                        [key]: event.target
                          .value as (typeof form.actions)[typeof key],
                      },
                    })
                  }
                  value={form.actions[key]}
                >
                  {decisions.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
                {form.actions[key] === "confirm" ? (
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <p className="font-medium">Kundbekräftelse krävs.</p>
                    <p className="mt-1 text-muted-foreground">
                      Automatisk kundbekräftelse är ännu inte aktiverad. Med
                      detta val utför AI:n inte handlingen.
                    </p>
                    <details className="mt-2 text-muted-foreground">
                      <summary className="min-h-11 py-2 font-medium text-foreground">
                        Mer information
                      </summary>
                      Bekräftelsen måste senare komma från en betrodd kundkanal.
                      Ett meddelande eller en uppgift från modellen kan inte
                      godkänna åtgärden.
                    </details>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">Språk och ton</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Styr hur AI:n uttrycker sig. Inställningarna kan aldrig ändra
            säkerhetsregler eller fakta.
          </p>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          Svarsspråk
          <select
            className="min-h-11 rounded-lg border bg-background px-3"
            disabled={!data.canEdit}
            onChange={(event) =>
              change({
                ...form,
                responseLanguage: event.target
                  .value as PolicyFormValue["responseLanguage"],
              })
            }
            value={form.responseLanguage}
          >
            <option value="business_default">Företagets standardspråk</option>
            <option value="swedish">Svenska</option>
            <option value="english">Engelska</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Ton
          <select
            className="min-h-11 rounded-lg border bg-background px-3"
            disabled={!data.canEdit}
            onChange={(event) =>
              change({
                ...form,
                communicationTone: event.target
                  .value as PolicyFormValue["communicationTone"],
              })
            }
            value={form.communicationTone}
          >
            <option value="neutral">Neutral</option>
            <option value="warm">Varm</option>
            <option value="formal">Formell</option>
          </select>
        </label>
      </section>
      {data.canEdit && dirty ? (
        <p className="text-sm font-medium" role="status">
          Du har osparade ändringar.
        </p>
      ) : null}
      {status ? (
        <p
          className={`text-sm ${status.kind === "error" ? "text-destructive" : ""}`}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      ) : null}
      {data.canEdit ? (
        <div className="flex flex-wrap gap-3">
          <Button disabled={saving || !dirty} type="submit">
            {saving ? "Sparar…" : "Spara ändringar"}
          </Button>
          <Button
            disabled={saving || !dirty}
            onClick={reset}
            type="button"
            variant="outline"
          >
            Återställ ändringar
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function AiPolicySettings() {
  const data = useQuery(api.aiPolicy.get, {});
  if (data === undefined) return <p role="status">Laddar AI-inställningar…</p>;
  if (data.policy === null)
    return (
      <p role="alert">AI-inställningarna kunde inte laddas. Ladda om sidan.</p>
    );
  return <PolicyForm data={data} key={data.policy.updatedAt} />;
}
