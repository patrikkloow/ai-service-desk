import { BusinessHoursSettings } from "@/components/business-hours-settings";
export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Öppettider</h1>
        <p className="mt-2 text-muted-foreground">
          När företaget normalt har öppet. Lediga bokningstider kontrolleras
          separat.
        </p>
      </header>
      <BusinessHoursSettings />
    </div>
  );
}
