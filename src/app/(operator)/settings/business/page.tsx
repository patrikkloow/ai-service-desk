import { BusinessProfileSettings } from "@/components/business-profile-settings";
export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Företag</h1>
        <p className="mt-2 text-muted-foreground">
          Grunduppgifter, språk och tidszon för kunddialogen.
        </p>
      </header>
      <BusinessProfileSettings />
    </div>
  );
}
