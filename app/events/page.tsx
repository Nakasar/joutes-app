import EventsCalendarWrapper from "@/components/EventsCalendarWrapper";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

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
  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 m-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Calendrier des Événements
          </h1>
        </div>
        <Button asChild>
          <Link href="/events/new">
            <Plus className="h-4 w-4 mr-2" />
            Créer un événement
          </Link>
        </Button>
      </div>
      <EventsCalendarWrapper basePath="/events" searchParams={params} />
    </div>
  );
}
