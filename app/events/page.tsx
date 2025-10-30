import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  return <EventsCalendarWrapper basePath="/events" />;
}
