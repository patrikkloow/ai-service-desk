"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Minus, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
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
type Schedule = Record<
  (typeof days)[number][0],
  Array<{ start: string; end: string }>
>;
type HoursData = NonNullable<
  ReturnType<typeof useQuery<typeof api.businessHours.get>>
>;

function HoursForm({ data }: { data: HoursData }) {
  const update = useMutation(api.businessHours.update);
  const [schedule, setSchedule] = useState<Schedule>(data.hours!.schedule);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function setDay(day: keyof Schedule, intervals: Schedule[keyof Schedule]) {
    setSchedule((current) => ({ ...current, [day]: intervals }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await update({ schedule });
      setStatus("Öppettiderna är sparade.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="max-w-3xl space-y-4" onSubmit={save}>
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <p className="mb-5 text-sm text-muted-foreground">
          Tiderna visas i {data.timezone ?? "företagets tidszon"}. De beskriver
          när ni normalt har öppet, inte vilka bokningstider som är lediga.
        </p>
        {!data.canEdit ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Endast en administratör kan ändra öppettiderna.
          </p>
        ) : null}
        <div className="divide-y">
          {days.map(([day, label]) => {
            const intervals = schedule[day];
            return (
              <fieldset
                className="grid gap-3 py-4 sm:grid-cols-[9rem_1fr]"
                key={day}
              >
                <legend className="contents">
                  <span className="font-medium">{label}</span>
                </legend>
                <div className="space-y-3">
                  {intervals.length === 0 ? (
                    <p className="min-h-11 py-2 text-sm text-muted-foreground">
                      Stängt
                    </p>
                  ) : (
                    intervals.map((interval, index) => (
                      <div
                        className="flex flex-wrap items-center gap-2"
                        key={`${day}-${index}`}
                      >
                        <Input
                          aria-label={`${label} öppnar`}
                          className="w-32"
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
                          type="time"
                          value={interval.start}
                        />
                        <span aria-hidden="true">–</span>
                        <Input
                          aria-label={`${label} stänger`}
                          className="w-32"
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
                          type="time"
                          value={interval.end}
                        />
                        {data.canEdit ? (
                          <Button
                            aria-label={`Ta bort tidsintervall för ${label}`}
                            onClick={() =>
                              setDay(
                                day,
                                intervals.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Minus />
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                  {data.canEdit && intervals.length < 4 ? (
                    <Button
                      onClick={() =>
                        setDay(day, [
                          ...intervals,
                          { start: "08:00", end: "17:00" },
                        ])
                      }
                      type="button"
                      variant="outline"
                    >
                      <Plus />
                      {intervals.length === 0
                        ? "Lägg till öppettid"
                        : "Lägg till intervall"}
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>
      {status ? (
        <p className="text-sm" role="status">
          {status}
        </p>
      ) : null}
      {data.canEdit ? (
        <Button disabled={saving} type="submit">
          {saving ? "Sparar…" : "Spara öppettider"}
        </Button>
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
