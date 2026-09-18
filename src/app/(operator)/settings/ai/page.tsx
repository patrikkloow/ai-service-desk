import { AiPolicySettings } from "@/components/ai-policy-settings";
import { SettingsPageHeader } from "@/components/settings-page-header";
export default function Page() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        description="Bestäm hur AI:n får hjälpa kunder och hur svaren ska låta."
        title="AI"
      />
      <AiPolicySettings />
    </div>
  );
}
