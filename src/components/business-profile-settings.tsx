"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { customerLanguageOptions } from "@/lib/business-setting-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneCombobox } from "@/components/timezone-combobox";

type Profile = NonNullable<
  ReturnType<typeof useQuery<typeof api.businessProfile.get>>
>;

function profileForm(profile: NonNullable<Profile["profile"]>) {
  return {
    companyName: profile.companyName,
    timezone: profile.timezone,
    defaultLanguage: profile.defaultLanguage,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    address: profile.address ?? "",
    businessDescription: profile.businessDescription ?? "",
  };
}

function ProfileForm({ data }: { data: Profile }) {
  const update = useMutation(api.businessProfile.update);
  const initial = profileForm(data.profile!);
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

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setStatus(null);
  }

  function reset() {
    setForm(saved);
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
      setSaved(form);
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
      className="grid max-w-3xl gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 sm:p-6"
      data-unsaved={dirty || undefined}
      onSubmit={save}
    >
      {!data.canEdit ? (
        <p className="sm:col-span-2 text-sm text-muted-foreground">
          Du kan läsa inställningarna. Endast en administratör kan ändra dem.
        </p>
      ) : null}
      {(
        [
          ["companyName", "Företagsnamn", "text"],
          ["phone", "Telefon", "tel"],
          ["email", "E-post", "email"],
          ["website", "Webbplats", "url"],
          ["address", "Adress", "text"],
        ] as const
      ).map(([name, label, type]) => (
        <label
          className={
            name === "address"
              ? "sm:col-span-2 grid gap-2 text-sm font-medium"
              : "grid gap-2 text-sm font-medium"
          }
          key={name}
        >
          {label}
          <Input
            disabled={!data.canEdit}
            maxLength={
              name === "address" ? 1000 : name === "website" ? 500 : 320
            }
            onChange={(event) => field(name, event.target.value)}
            required={name === "companyName"}
            type={type}
            value={form[name]}
          />
        </label>
      ))}
      <label className="grid gap-2 text-sm font-medium">
        Standardspråk för kundsvar
        <select
          className="min-h-11 rounded-lg border bg-background px-3"
          disabled={!data.canEdit}
          onChange={(event) => field("defaultLanguage", event.target.value)}
          value={form.defaultLanguage}
        >
          {customerLanguageOptions(form.defaultLanguage).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="font-normal text-muted-foreground">
          Påverkar AI:ns kundsvar, inte språket i personalens gränssnitt.
        </span>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Tidszon
        <TimezoneCombobox
          disabled={!data.canEdit}
          onChange={(value) => field("timezone", value)}
          value={form.timezone}
        />
        <span className="font-normal text-muted-foreground">
          Styr hur lokala öppettider och visade klockslag tolkas. Redan sparade
          bokningstidpunkter ändras inte.
        </span>
      </label>
      <label className="sm:col-span-2 grid gap-2 text-sm font-medium">
        Kort företagsbeskrivning
        <Textarea
          disabled={!data.canEdit}
          maxLength={4000}
          onChange={(event) => field("businessDescription", event.target.value)}
          rows={5}
          value={form.businessDescription}
        />
        <span className="font-normal text-muted-foreground">
          Beskrivande information. Den kan aldrig ändra AI:ns säkerhetsregler
          eller priser.
        </span>
      </label>
      {data.canEdit && dirty ? (
        <p className="sm:col-span-2 text-sm font-medium" role="status">
          Du har osparade ändringar.
        </p>
      ) : null}
      {status ? (
        <p
          className={`sm:col-span-2 text-sm ${status.kind === "error" ? "text-destructive" : ""}`}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      ) : null}
      {data.canEdit ? (
        <div className="sm:col-span-2 flex flex-wrap gap-3">
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

export function BusinessProfileSettings() {
  const data = useQuery(api.businessProfile.get, {});
  if (data === undefined) return <p role="status">Laddar företagsuppgifter…</p>;
  if (data.profile === null)
    return (
      <p role="alert">Företagsprofilen kunde inte laddas. Ladda om sidan.</p>
    );
  return <ProfileForm data={data} key={data.profile.updatedAt} />;
}
