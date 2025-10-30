import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string }>;
}) {
  const params = await searchParams;
  const showAllGames = params.showAll === "true";

  return <EventsCalendarWrapper showAllGames={showAllGames} basePath="/events" />;
}
