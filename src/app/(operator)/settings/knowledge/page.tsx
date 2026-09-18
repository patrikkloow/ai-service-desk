import { KnowledgeConsole } from "@/components/knowledge-console";
import { SettingsPageHeader } from "@/components/settings-page-header";
export default function Page() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        description="Gemensamma svar och riktlinjer för företaget."
        title="Kunskap"
      />
      <KnowledgeConsole />
    </div>
  );
}
