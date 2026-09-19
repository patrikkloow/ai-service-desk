import { Temporal } from "temporal-polyfill";

export function localDateTimeToEpoch(value: string, timezone: string) {
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, {
      disambiguation: "reject",
    }).epochMilliseconds;
  } catch {
    return null;
  }
}

export function epochToLocalInput(value: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(value)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

export function localDate(value: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(value)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

export function addMinutesToLocalInput(
  value: string,
  minutes: number,
  timezone: string,
) {
  const epoch = localDateTimeToEpoch(value, timezone);
  return epoch === null
    ? ""
    : epochToLocalInput(epoch + minutes * 60_000, timezone);
}
