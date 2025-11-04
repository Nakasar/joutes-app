import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";

export const dynamic = "force-dynamic";

type EventsPageProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
    allGames?: string;
  }>;
};

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const params = await searchParams;
  return <EventsCalendarWrapper basePath="/events" searchParams={params} />;
}
