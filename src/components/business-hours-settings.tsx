"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const days = [
  ["monday", "Måndag"],
  ["tuesday", "Tisdag"],
  ["wednesday", "Onsdag"],
  ["thursday", "Torsdag"],
  ["friday", "Fredag"],
  ["saturday", "Lördag"],
  ["sunday", "Söndag"],
] as const;
type Day = (typeof days)[number][0];
type Schedule = Record<Day, Array<{ start: string; end: string }>>;
type HoursData = NonNullable<
  ReturnType<typeof useQuery<typeof api.businessHours.get>>
>;

function copySchedule(schedule: Schedule): Schedule {
  return Object.fromEntries(
    days.map(([day]) => [
      day,
      schedule[day].map((interval) => ({ ...interval })),
    ]),
  ) as Schedule;
}

function minutes(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function validateSchedule(schedule: Schedule) {
  const errors: Partial<Record<Day, string>> = {};
  for (const [day, label] of days) {
    const intervals = schedule[day]
      .map((interval) => ({
        start: minutes(interval.start),
        end: minutes(interval.end),
      }))
      .sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
    if (
      intervals.some(
        (interval) => interval.start === null || interval.end === null,
      )
    ) {
      errors[day] = `${label}: fyll i både start- och sluttid.`;
      continue;
    }
    if (intervals.some((interval) => interval.end! <= interval.start!)) {
      errors[day] = `${label}: sluttiden måste vara efter starttiden.`;
      continue;
    }
    if (
      intervals.some(
        (interval, index) =>
          index > 0 && interval.start! < intervals[index - 1]!.end!,
      )
    )
      errors[day] = `${label}: tidsintervallen får inte överlappa varandra.`;
  }
  return errors;
}

function HoursForm({ data }: { data: HoursData }) {
  const update = useMutation(api.businessHours.update);
  const initial = copySchedule(data.hours!.schedule);
  const [saved, setSaved] = useState(initial);
  const [schedule, setSchedule] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Day, string>>>({});
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dirty = JSON.stringify(schedule) !== JSON.stringify(saved);
  useUnsavedChangesWarning(data.canEdit && dirty);

  function setDay(day: Day, intervals: Schedule[Day]) {
    setSchedule((current) => ({ ...current, [day]: intervals }));
    setErrors((current) => ({ ...current, [day]: undefined }));
    setStatus(null);
  }

  function reset() {
    setSchedule(copySchedule(saved));
    setErrors({});
    setStatus(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || savingRef.current) return;
    const nextErrors = validateSchedule(schedule);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({
        kind: "error",
        text: "Kontrollera de markerade öppettiderna.",
      });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus(null);
    try {
      await update({ schedule });
      setSaved(copySchedule(schedule));
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
      className="max-w-3xl space-y-4"
      data-unsaved={dirty || undefined}
      onSubmit={save}
    >
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="mb-5 text-sm text-muted-foreground">
          Tiderna visas i {data.timezone ?? "företagets tidszon"}. De beskriver
          när ni normalt har öppet, inte vilka bokningstider som är lediga.
          Ändra tidszonen under{" "}
          <Link
            className="font-medium underline underline-offset-4"
            href="/settings/business"
          >
            Företag
          </Link>
          .
        </p>
        {!data.canEdit ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Du kan läsa öppettiderna. Endast en administratör kan ändra dem.
          </p>
        ) : null}
        <div className="divide-y">
          {days.map(([day, label]) => {
            const intervals = schedule[day];
            const errorId = `${day}-hours-error`;
            return (
              <fieldset
                className="grid min-w-0 gap-3 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]"
                key={day}
              >
                <legend className="contents">
                  <span className="font-medium">{label}</span>
                </legend>
                <div className="min-w-0 space-y-3">
                  {intervals.length === 0 ? (
                    <p className="min-h-11 py-2 text-sm text-muted-foreground">
                      Stängt
                    </p>
                  ) : (
                    intervals.map((interval, index) => (
                      <div
                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap"
                        key={`${day}-${index}`}
                      >
                        <Input
                          aria-describedby={errors[day] ? errorId : undefined}
                          aria-invalid={Boolean(errors[day])}
                          aria-label={`${label} öppnar, intervall ${index + 1}`}
                          className="w-full sm:w-32"
                          disabled={!data.canEdit}
                          onChange={(event) =>
                            setDay(
                              day,
                              intervals.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, start: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                          type="time"
                          value={interval.start}
                        />
                        <span aria-hidden="true">–</span>
                        <Input
                          aria-describedby={errors[day] ? errorId : undefined}
                          aria-invalid={Boolean(errors[day])}
                          aria-label={`${label} stänger, intervall ${index + 1}`}
                          className="w-full sm:w-32"
                          disabled={!data.canEdit}
                          onChange={(event) =>
                            setDay(
                              day,
                              intervals.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, end: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                          type="time"
                          value={interval.end}
                        />
                        {data.canEdit ? (
                          <Button
                            className="col-span-3 justify-self-start px-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:col-span-1"
                            onClick={() =>
                              setDay(
                                day,
                                intervals.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" />
                            Ta bort
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                  {errors[day] ? (
                    <p
                      className="text-sm text-destructive"
                      id={errorId}
                      role="alert"
                    >
                      {errors[day]}
                    </p>
                  ) : null}
                  {data.canEdit && intervals.length < 4 ? (
                    <Button
                      onClick={() =>
                        setDay(day, [...intervals, { start: "", end: "" }])
                      }
                      type="button"
                      variant="outline"
                    >
                      <Plus aria-hidden="true" />
                      {intervals.length === 0
                        ? "Lägg till öppettid"
                        : "Lägg till tidsintervall"}
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>
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

export function BusinessHoursSettings() {
  const data = useQuery(api.businessHours.get, {});
  if (data === undefined) return <p role="status">Laddar öppettider…</p>;
  if (data.hours === null)
    return <p role="alert">Öppettiderna kunde inte laddas. Ladda om sidan.</p>;
  return <HoursForm data={data} key={data.hours.updatedAt} />;
}
