export const supportedCustomerLanguages = [
  { value: "sv", label: "Svenska" },
  { value: "en", label: "Engelska" },
] as const;

export function customerLanguageOptions(current: string) {
  if (supportedCustomerLanguages.some((option) => option.value === current))
    return [...supportedCustomerLanguages];
  const primary = current.toLowerCase().split("-")[0];
  const known = supportedCustomerLanguages.find(
    (option) => option.value === primary,
  );
  return [
    {
      value: current,
      label: known
        ? `${known.label} (${current}, sparat värde)`
        : `${current} (sparat värde, AI-svar använder svenska)`,
    },
    ...supportedCustomerLanguages,
  ];
}

export type TimezoneOption = {
  value: string;
  city: string;
  label: string;
};

const fallbackTimezones = [
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

function timezoneCity(value: string) {
  const part = value.split("/").at(-1) ?? value;
  return part.replaceAll("_", " ");
}

export function timezoneLabel(value: string) {
  return `${timezoneCity(value)} — ${value}`;
}

export function timezoneOptions(current: string): TimezoneOption[] {
  let values: string[];
  try {
    values = Intl.supportedValuesOf("timeZone");
  } catch {
    values = fallbackTimezones;
  }
  if (current && !values.includes(current)) values = [current, ...values];
  return values.map((value) => ({
    value,
    city: timezoneCity(value),
    label: timezoneLabel(value),
  }));
}
