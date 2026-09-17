import { CoreDataConsole } from "@/components/core-data-console";
export default function Page() { return <div className="space-y-6"><header><h1 className="text-3xl font-semibold tracking-tight">Kunder</h1><p className="mt-2 text-muted-foreground">Kunduppgifter för dina förfrågningar och bokningar.</p></header><CoreDataConsole area="customers" /></div>; }
