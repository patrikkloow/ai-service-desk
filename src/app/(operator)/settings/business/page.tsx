import { BusinessProfileSettings } from "@/components/business-profile-settings";
import { SettingsPageHeader } from "@/components/settings-page-header";
export default function Page() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        description="Grunduppgifter, språk och tidszon för kunddialogen."
        title="Företag"
      />
      <BusinessProfileSettings />
    </div>
  );
}
