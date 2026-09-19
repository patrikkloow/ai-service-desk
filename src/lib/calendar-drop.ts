export type ScheduleConfirmationReason =
  | "business_hours_missing"
  | "outside_business_hours"
  | "outside_schedule";

export type CalendarBookingResult =
  | {
      status: "needs_confirmation";
      reason: ScheduleConfirmationReason;
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

export async function attemptCalendarDrop({
  save,
  revert,
}: {
  save: () => Promise<CalendarBookingResult>;
  revert: () => void;
}) {
  try {
    const result = await save();
    return result.status === "needs_confirmation"
      ? { kind: "confirmation_required" as const, reason: result.reason }
      : { kind: "saved" as const, result };
  } catch (reason) {
    revert();
    return { kind: "rejected" as const, reason };
  }
}
