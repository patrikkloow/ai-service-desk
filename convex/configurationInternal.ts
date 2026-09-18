import { internalQuery } from "./_generated/server";
import { getTenantConfiguration } from "./configuration";
import { requireCurrentTenant } from "./tenant";

function quotedExcerpt(value: string, maximum: number) {
  let excerpt = value.slice(0, maximum - 2);
  while (JSON.stringify(excerpt).length > maximum)
    excerpt = excerpt.slice(0, -1);
  return JSON.stringify(excerpt);
}

export const renderBusinessProfile = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireCurrentTenant(ctx);
    const profile = await getTenantConfiguration(
      ctx,
      "businessProfiles",
      tenant.organization._id,
    );
    if (!profile?.configured)
      return "Jag har ingen verifierad företagsinformation registrerad ännu.";
    const details = [
      `Företag: ${quotedExcerpt(profile.companyName, 202)}`,
      `Tidszon: ${quotedExcerpt(profile.timezone, 102)}`,
      `Standardspråk: ${quotedExcerpt(profile.defaultLanguage, 34)}`,
      profile.phone ? `Telefon: ${quotedExcerpt(profile.phone, 66)}` : null,
      profile.email ? `E-post: ${quotedExcerpt(profile.email, 322)}` : null,
      profile.website
        ? `Webbplats: ${quotedExcerpt(profile.website, 502)}`
        : null,
      profile.address
        ? `Adress: ${quotedExcerpt(profile.address, 1002)}`
        : null,
      profile.businessDescription
        ? `Beskrivning: ${quotedExcerpt(profile.businessDescription, 1200)}`
        : null,
    ].filter((value): value is string => Boolean(value));
    return `Registrerad företagsinformation:\n${details.join("\n")}`;
  },
});

export const renderBusinessHours = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireCurrentTenant(ctx);
    const [hours, profile] = await Promise.all([
      getTenantConfiguration(ctx, "businessHours", tenant.organization._id),
      getTenantConfiguration(ctx, "businessProfiles", tenant.organization._id),
    ]);
    if (!hours?.configured || profile === null)
      return "Jag har inga verifierade öppettider registrerade ännu.";
    const labels: Record<string, string> = {
      monday: "Måndag",
      tuesday: "Tisdag",
      wednesday: "Onsdag",
      thursday: "Torsdag",
      friday: "Fredag",
      saturday: "Lördag",
      sunday: "Söndag",
    };
    const rows = Object.entries(hours.schedule).map(
      ([day, intervals]) =>
        `${labels[day] ?? day}: ${
          intervals.length === 0
            ? "Stängt"
            : intervals
                .map((interval) => `${interval.start}–${interval.end}`)
                .join(", ")
        }`,
    );
    return `Ordinarie öppettider (${profile.timezone}). Bokningsbara tider måste kontrolleras separat:\n${rows.join("\n")}`;
  },
});
