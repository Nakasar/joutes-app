import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string }>;
}) {
  const params = await searchParams;
  const showAllGames = params.showAll === "true";

  return <EventsCalendarWrapper showAllGames={showAllGames} />;
}
