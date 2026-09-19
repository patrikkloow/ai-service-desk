export function scheduleOverrideReason(reason: unknown): string | null {
  const data =
    typeof reason === "object" && reason !== null && "data" in reason
      ? (reason as { data?: unknown }).data
      : null;
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "SCHEDULE_OVERRIDE_REQUIRED"
  ) {
    const value = "reason" in data ? data.reason : null;
    return value === "outside_schedule"
      ? "Tiden ligger utanför resursens ordinarie arbetstid."
      : value === "outside_business_hours"
        ? "Tiden ligger utanför företagets ordinarie öppettider."
        : "Företagets öppettider är inte konfigurerade för tiden.";
  }
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
