import { getAllEvents } from "@/lib/db/events";
import { getAllLairs } from "@/lib/db/lairs";
import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import EventsCalendar from "./EventsCalendar";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getAllEvents();
  const lairs = await getAllLairs();

  // Créer un map des lairs pour faciliter la recherche
  const lairsMap = new Map<string, Lair>();
  lairs.forEach((lair) => {
    lairsMap.set(lair.id, lair);
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Calendrier des Événements</h1>
      <EventsCalendar events={events} lairsMap={lairsMap} />
    </div>
  );
}
