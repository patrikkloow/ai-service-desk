import { ResourceSettings } from "@/components/resource-settings";
import { SettingsPageHeader } from "@/components/settings-page-header";

export default function Page() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Resurser"
        description="Personal, lokaler och utrustning som kan bokas, med egna scheman och blockerad tid."
      />
      <ResourceSettings />
    </div>
  );
}
