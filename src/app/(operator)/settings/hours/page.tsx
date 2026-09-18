import { BusinessHoursSettings } from "@/components/business-hours-settings";
import { SettingsPageHeader } from "@/components/settings-page-header";
export default function Page() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        description="När företaget normalt har öppet. Lediga bokningstider kontrolleras separat."
        title="Öppettider"
      />
      <BusinessHoursSettings />
    </div>
  );
}
