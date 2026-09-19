export type ScheduleConfirmationReason =
  | "business_hours_missing"
  | "outside_business_hours"
  | "outside_schedule";

export type CalendarRejectionReason =
  | "booking_conflict"
  | "blocked"
  | "booking_changed"
  | "resource_unavailable"
  | "schedule_missing"
  | "service_not_supported";

export type CalendarBookingResult =
  | {
      status: "needs_confirmation";
      reason: ScheduleConfirmationReason;
    }
  | {
      status: "rejected";
      reason: CalendarRejectionReason;
    }
  | {
      status: "saved";
      bookingId: string;
      updatedAt: number;
    };

function convexErrorData(reason: unknown): Record<string, unknown> | null {
  if (typeof reason !== "object" || reason === null || Array.isArray(reason))
    return null;
  const data = "data" in reason ? reason.data : null;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return null;
  return data as Record<string, unknown>;
}

export function hasConvexErrorCode(reason: unknown, code: string): boolean {
  return convexErrorData(reason)?.code === code;
}

export function scheduleConfirmationText(
  action: "create" | "reschedule",
  reason: ScheduleConfirmationReason,
) {
  const schedule =
    reason === "outside_schedule"
      ? "resursens ordinarie arbetstid"
      : reason === "business_hours_missing"
        ? "företagets ännu inte konfigurerade ordinarie arbetstid"
        : "ordinarie arbetstid";
  return action === "create"
    ? `Tiden ligger utanför ${schedule}. Vill du boka ändå?`
    : `Den nya tiden ligger utanför ${schedule}. Vill du flytta ändå?`;
}

export function bookingRejectionText(reason: CalendarRejectionReason) {
  if (reason === "booking_conflict")
    return "Tiden är redan bokad för den valda resursen. Välj en annan tid eller resurs.";
  if (reason === "blocked")
    return "Tiden är blockerad för den valda resursen. Välj en annan tid eller resurs.";
  if (reason === "booking_changed")
    return "Bokningen har ändrats av någon annan. Kalendern har synkroniserats.";
  if (reason === "schedule_missing")
    return "Resursen behöver ett konfigurerat schema.";
  if (reason === "resource_unavailable")
    return "Resursen är inte tillgänglig för bokningen.";
  return "Resursen kan inte bokas för den valda tjänsten.";
}

export async function attemptCalendarDrop({
  save,
  revert,
}: {
  save: () => Promise<CalendarBookingResult>;
  revert: () => void;
}) {
  try {
    const result = await save();
    if (result.status === "needs_confirmation")
      return { kind: "confirmation_required" as const, reason: result.reason };
    if (result.status === "rejected") {
      revert();
      return { kind: "rejected" as const, reason: result.reason };
    }
    return { kind: "saved" as const, result };
  } catch (reason) {
    revert();
    return { kind: "rejected" as const, reason };
  }
}
