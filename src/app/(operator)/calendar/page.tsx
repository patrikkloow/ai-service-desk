import { BookingCalendarLive } from "@/components/booking-calendar-live";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; resource?: string }>;
}) {
  const { date, resource } = await searchParams;
  const safeDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Kalender</h1>
        <p className="mt-2 text-muted-foreground">
          Gemensam planering för personalens och AI:ns bokningar.
        </p>
      </header>
      <BookingCalendarLive initialDate={safeDate} initialResource={resource} />
    </div>
  );
}
