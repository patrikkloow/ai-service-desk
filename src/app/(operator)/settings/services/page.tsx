import { CoreDataConsole } from "@/components/core-data-console";
import { SettingsPageHeader } from "@/components/settings-page-header";
export default function Page() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        description="Det du erbjuder och de priser som finns registrerade."
        title="Tjänster & priser"
      />
      <CoreDataConsole area="services" />
    </div>
  );
}
