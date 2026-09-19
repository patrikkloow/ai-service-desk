import { BookingCalendarLive } from "@/components/booking-calendar-live";

export default function Page() {
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Kalender</h1>
        <p className="mt-2 text-muted-foreground">
          Gemensam planering för personalens och AI:ns bokningar.
        </p>
      </header>
      <BookingCalendarLive />
    </div>
  );
}
