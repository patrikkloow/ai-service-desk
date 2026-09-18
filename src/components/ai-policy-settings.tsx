"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
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

function PolicyForm({ data }: { data: PolicyData }) {
  const update = useMutation(api.aiPolicy.update);
  const policy = data.policy!;
  const [actionsState, setActions] = useState(policy.actions);
  const [responseLanguage, setLanguage] = useState(policy.responseLanguage);
  const [communicationTone, setTone] = useState(policy.communicationTone);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await update({
        actions: actionsState,
        responseLanguage,
        communicationTone,
      });
      setStatus("AI-inställningarna är sparade.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="max-w-3xl space-y-5" onSubmit={save}>
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="font-semibold">Åtgärder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reglerna kontrolleras på servern innan något ändras. Att be om
          mänsklig hjälp är alltid möjligt.
        </p>
        {!data.canEdit ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Endast en administratör kan ändra reglerna.
          </p>
        ) : null}
        <div className="mt-5 divide-y">
          {actions.map(([key, label, copy]) => (
            <label
              className="grid gap-3 py-4 sm:grid-cols-[1fr_16rem] sm:items-center"
              key={key}
            >
              <span>
                <span className="block font-medium">{label}</span>
                <span className="text-sm text-muted-foreground">{copy}</span>
              </span>
              <select
                className="min-h-11 rounded-lg border bg-background px-3 text-sm"
                disabled={!data.canEdit}
                onChange={(event) =>
                  setActions((current) => ({
                    ...current,
                    [key]: event.target.value as (typeof current)[typeof key],
                  }))
                }
                value={actionsState[key]}
              >
                {decisions.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
          Bekräftelsekrävande åtgärder förblir blockerade tills en framtida
          kundkanal kan verifiera en specifik bekräftelse. Ett meddelande eller
          en kryssruta i webbläsaren räcker inte.
        </p>
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
              setLanguage(event.target.value as typeof responseLanguage)
            }
            value={responseLanguage}
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
              setTone(event.target.value as typeof communicationTone)
            }
            value={communicationTone}
          >
            <option value="neutral">Neutral</option>
            <option value="warm">Varm</option>
            <option value="formal">Formell</option>
          </select>
        </label>
      </section>
      {status ? (
        <p className="text-sm" role="status">
          {status}
        </p>
      ) : null}
      {data.canEdit ? (
        <Button disabled={saving} type="submit">
          {saving ? "Sparar…" : "Spara AI-inställningar"}
        </Button>
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
