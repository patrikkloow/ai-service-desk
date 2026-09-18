"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Profile = NonNullable<
  ReturnType<typeof useQuery<typeof api.businessProfile.get>>
>;

function ProfileForm({ data }: { data: Profile }) {
  const update = useMutation(api.businessProfile.update);
  const profile = data.profile!;
  const [form, setForm] = useState({
    companyName: profile.companyName,
    timezone: profile.timezone,
    defaultLanguage: profile.defaultLanguage,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    address: profile.address ?? "",
    businessDescription: profile.businessDescription ?? "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await update(form);
      setStatus("Företagsuppgifterna är sparade.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="grid max-w-3xl gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 sm:p-6"
      onSubmit={save}
    >
      {!data.canEdit ? (
        <p className="sm:col-span-2 text-sm text-muted-foreground">
          Endast en administratör kan ändra uppgifterna.
        </p>
      ) : null}
      {(
        [
          ["companyName", "Företagsnamn", "text"],
          ["timezone", "Tidszon", "text"],
          ["defaultLanguage", "Standardspråk", "text"],
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
            required={
              name === "companyName" ||
              name === "timezone" ||
              name === "defaultLanguage"
            }
            type={type}
            value={form[name]}
          />
        </label>
      ))}
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
      {status ? (
        <p className="sm:col-span-2 text-sm" role="status">
          {status}
        </p>
      ) : null}
      {data.canEdit ? (
        <div className="sm:col-span-2">
          <Button disabled={saving} type="submit">
            {saving ? "Sparar…" : "Spara företag"}
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
