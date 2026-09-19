"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { epochToLocalInput, localDateTimeToEpoch } from "@/lib/booking-time";

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

function copySchedule(schedule: Schedule): Schedule {
  return Object.fromEntries(
    days.map(([day]) => [
      day,
      schedule[day].map((interval) => ({ ...interval })),
    ]),
  ) as Schedule;
}

export function ResourceSettings() {
  const data = useQuery(api.resources.list, { includeInactive: true });
  const services = useQuery(api.services.list, {});
  const create = useMutation(api.resources.create);
  const update = useMutation(api.resources.update);
  const updateSchedule = useMutation(api.resources.updateSchedule);
  const copyHours = useMutation(api.resources.copyBusinessHours);
  const setServices = useMutation(api.resources.setServices);
  const createBlock = useMutation(api.resources.createBlock);
  const removeBlock = useMutation(api.resources.removeBlock);
  const [selectedId, setSelectedId] = useState<Id<"resources"> | "">("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"person" | "room" | "equipment">(
    "person",
  );
  const [draftSchedule, setDraftSchedule] = useState<Schedule | null>(null);
  const [draftServices, setDraftServices] = useState<Array<
    Id<"services">
  > | null>(null);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockNote, setBlockNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selected = data?.resources.find(
    (resource) => resource._id === selectedId,
  );
  const schedule =
    draftSchedule ??
    (selected?.schedule?.schedule as Schedule | undefined) ??
    null;
  const selectedServices = draftServices ?? selected?.serviceIds ?? [];
  const [blockRange] = useState(() => {
    const now = Date.now();
    return {
      startTime: now - 180 * 86_400_000,
      endTime: now + 180 * 86_400_000,
    };
  });
  const blocks = useQuery(
    api.resources.listBlocks,
    selectedId ? { resourceId: selectedId, ...blockRange } : "skip",
  );

  if (!data || !services) return <p role="status">Laddar resurser…</p>;

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ändringen kunde inte sparas.",
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseResource(value: Id<"resources"> | "") {
    setSelectedId(value);
    setDraftSchedule(null);
    setDraftServices(null);
    setMessage(null);
  }

  function setDay(day: Day, intervals: Schedule[Day]) {
    if (!schedule) return;
    setDraftSchedule({ ...copySchedule(schedule), [day]: intervals });
  }

  return (
    <div className="max-w-4xl space-y-6">
      {message ? (
        <p className="rounded-lg bg-muted p-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="font-semibold">Bokningsbara resurser</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          En resurs är en person, lokal eller utrustning. Den behöver inget
          användarkonto.
        </p>
        {!data.canEdit ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Du kan läsa resurserna. Endast en administratör kan ändra dem.
          </p>
        ) : null}
        {data.canEdit ? (
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const id = await create({ name: newName, kind: newKind });
                setNewName("");
                chooseResource(id);
              }, "Resursen skapades. Konfigurera dess schema innan bokning.");
            }}
          >
            <Input
              aria-label="Resursnamn"
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Resursnamn"
              required
              value={newName}
            />
            <select
              aria-label="Resurstyp"
              className="rounded-lg border bg-background px-3"
              onChange={(event) =>
                setNewKind(event.target.value as typeof newKind)
              }
              value={newKind}
            >
              <option value="person">Person</option>
              <option value="room">Lokal</option>
              <option value="equipment">Utrustning</option>
            </select>
            <Button disabled={busy} type="submit">
              <Plus aria-hidden="true" />
              Lägg till
            </Button>
          </form>
        ) : null}
        <label className="mt-5 grid gap-2 text-sm font-medium">
          Vald resurs
          <select
            className="rounded-lg border bg-background px-3"
            onChange={(event) =>
              chooseResource(event.target.value as Id<"resources"> | "")
            }
            value={selectedId}
          >
            <option value="">Välj resurs</option>
            {data.resources.map((resource) => (
              <option key={resource._id} value={resource._id}>
                {resource.name} ·{" "}
                {resource.status === "active" ? "Aktiv" : "Inaktiv"}
              </option>
            ))}
          </select>
        </label>
        {selected && data.canEdit ? (
          <Button
            className="mt-3"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  update({
                    resourceId: selected._id,
                    status:
                      selected.status === "active" ? "inactive" : "active",
                  }),
                "Resursens status uppdaterades.",
              )
            }
            variant="outline"
          >
            {selected.status === "active"
              ? "Inaktivera resurs"
              : "Aktivera resurs"}
          </Button>
        ) : null}
      </section>

      {selected ? (
        <>
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  Veckoschema för {selected.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Företagets öppettider och resursens bokningsbara tider är
                  separata.
                </p>
              </div>
              {data.canEdit ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await copyHours({ resourceId: selected._id });
                      setDraftSchedule(null);
                    }, "Företagets öppettider kopierades som en engångsåtgärd.")
                  }
                  variant="outline"
                >
                  Kopiera företagets öppettider
                </Button>
              ) : null}
            </div>
            {!schedule ? (
              <p className="mt-4 text-sm text-destructive">
                Schema saknas. Resursen kan inte bokas.
              </p>
            ) : (
              <div className="mt-5 divide-y">
                {days.map(([day, label]) => (
                  <div
                    className="grid gap-3 py-4 sm:grid-cols-[8rem_1fr]"
                    key={day}
                  >
                    <span className="font-medium">{label}</span>
                    <div className="space-y-2">
                      {schedule[day].length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">
                          Inte bokningsbar
                        </p>
                      ) : (
                        schedule[day].map((interval, index) => (
                          <div
                            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex"
                            key={`${day}-${index}`}
                          >
                            <Input
                              aria-label={`${label} start ${index + 1}`}
                              disabled={!data.canEdit}
                              onChange={(event) =>
                                setDay(
                                  day,
                                  schedule[day].map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, start: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              type="time"
                              value={interval.start}
                            />
                            <span>–</span>
                            <Input
                              aria-label={`${label} slut ${index + 1}`}
                              disabled={!data.canEdit}
                              onChange={(event) =>
                                setDay(
                                  day,
                                  schedule[day].map((item, itemIndex) =>
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
                                className="col-span-3 justify-self-start text-destructive"
                                onClick={() =>
                                  setDay(
                                    day,
                                    schedule[day].filter(
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
                      {data.canEdit && schedule[day].length < 4 ? (
                        <Button
                          onClick={() =>
                            setDay(day, [
                              ...schedule[day],
                              { start: "08:00", end: "17:00" },
                            ])
                          }
                          type="button"
                          variant="outline"
                        >
                          <Plus aria-hidden="true" />
                          Intervall
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.canEdit && schedule ? (
              <Button
                className="mt-4"
                disabled={busy || !draftSchedule}
                onClick={() =>
                  void run(async () => {
                    await updateSchedule({
                      resourceId: selected._id,
                      schedule,
                    });
                    setDraftSchedule(null);
                  }, "Schemat sparades.")
                }
              >
                Spara schema
              </Button>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <h2 className="font-semibold">Tjänster</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              En tjänst utan resurskoppling kan bokas på alla aktiva resurser.
              När en tjänst kopplas här begränsas den till de valda resurserna.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {services
                .filter((service) => service.status === "active")
                .map((service) => (
                  <label
                    className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
                    key={service._id}
                  >
                    <input
                      checked={selectedServices.includes(service._id)}
                      disabled={!data.canEdit}
                      onChange={(event) =>
                        setDraftServices(
                          event.target.checked
                            ? [...selectedServices, service._id]
                            : selectedServices.filter(
                                (id) => id !== service._id,
                              ),
                        )
                      }
                      type="checkbox"
                    />
                    {service.name}
                  </label>
                ))}
            </div>
            {data.canEdit ? (
              <Button
                className="mt-4"
                disabled={busy || draftServices === null}
                onClick={() =>
                  void run(async () => {
                    await setServices({
                      resourceId: selected._id,
                      serviceIds: selectedServices,
                    });
                    setDraftServices(null);
                  }, "Tjänstekopplingarna sparades.")
                }
              >
                Spara tjänster
              </Button>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <h2 className="font-semibold">Blockerad tid</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Interna anteckningar visas inte för AI eller kunder. Tidszon:{" "}
              {data.timezone}.
            </p>
            {data.canEdit ? (
              <form
                className="mt-4 grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const startTime = localDateTimeToEpoch(
                    blockStart,
                    data.timezone,
                  );
                  const endTime = localDateTimeToEpoch(blockEnd, data.timezone);
                  if (startTime === null || endTime === null) {
                    setMessage(
                      "Tiden finns inte eller är tvetydig i företagets tidszon.",
                    );
                    return;
                  }
                  void run(async () => {
                    await createBlock({
                      resourceId: selected._id,
                      startTime,
                      endTime,
                      ...(blockNote.trim() ? { note: blockNote } : {}),
                    });
                    setBlockStart("");
                    setBlockEnd("");
                    setBlockNote("");
                  }, "Tiden blockerades.");
                }}
              >
                <label className="grid gap-2 text-sm font-medium">
                  Start
                  <Input
                    onChange={(event) => setBlockStart(event.target.value)}
                    required
                    type="datetime-local"
                    value={blockStart}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Slut
                  <Input
                    onChange={(event) => setBlockEnd(event.target.value)}
                    required
                    type="datetime-local"
                    value={blockEnd}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                  Intern anteckning
                  <Input
                    maxLength={1000}
                    onChange={(event) => setBlockNote(event.target.value)}
                    value={blockNote}
                  />
                </label>
                <Button disabled={busy} type="submit">
                  Blockera tid
                </Button>
              </form>
            ) : null}
            <ul className="mt-4 divide-y">
              {blocks?.map((block) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={block._id}
                >
                  <div>
                    <p>
                      {epochToLocalInput(block.startTime, data.timezone)} –{" "}
                      {epochToLocalInput(block.endTime, data.timezone)}
                    </p>
                    {block.note ? (
                      <p className="text-sm text-muted-foreground">
                        {block.note}
                      </p>
                    ) : null}
                  </div>
                  {data.canEdit ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => removeBlock({ blockId: block._id }),
                          "Blockeringen togs bort.",
                        )
                      }
                      variant="destructive"
                    >
                      Ta bort
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
