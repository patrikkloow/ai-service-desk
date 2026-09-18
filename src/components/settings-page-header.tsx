import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function SettingsPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <Link
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        href="/settings"
      >
        <ArrowLeft aria-hidden="true" />
        Tillbaka till inställningar
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p>
    </header>
  );
}
