import { AiPolicySettings } from "@/components/ai-policy-settings";
export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">AI</h1>
        <p className="mt-2 text-muted-foreground">
          Bestäm hur AI:n får hjälpa kunder och hur svaren ska låta.
        </p>
      </header>
      <AiPolicySettings />
    </div>
  );
}
