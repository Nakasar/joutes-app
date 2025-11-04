import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";

type HomeProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
    allGames?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  return <EventsCalendarWrapper searchParams={params} />;
}
