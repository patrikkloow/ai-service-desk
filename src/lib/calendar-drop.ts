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

export function scheduleOverrideReason(reason: unknown): string | null {
  const data = convexErrorData(reason);
  if (data?.code !== "SCHEDULE_OVERRIDE_REQUIRED") return null;
  if (data.reason === "outside_schedule")
    return "Tiden ligger utanför resursens ordinarie arbetstid.";
  if (data.reason === "outside_business_hours")
    return "Tiden ligger utanför företagets ordinarie öppettider.";
  if (data.reason === "business_hours_missing")
    return "Företagets öppettider är inte konfigurerade för tiden.";
  return null;
}

export async function attemptCalendarDrop({
  save,
  revert,
}: {
  save: () => Promise<unknown>;
  revert: () => void;
}) {
  try {
    await save();
    return { kind: "saved" as const };
  } catch (reason) {
    const message = scheduleOverrideReason(reason);
    if (message) return { kind: "confirmation_required" as const, message };
    revert();
    return { kind: "rejected" as const, reason };
  }
}
