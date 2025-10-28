import { getAllEvents, getEventsByLairIds } from "@/lib/db/events";
import { getAllLairs } from "@/lib/db/lairs";
import { Lair } from "@/lib/types/Lair";
import EventsCalendar from "@/app/events/EventsCalendar";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { getUserById } from "@/lib/db/users";

export default async function Home() {
  // Récupérer la session utilisateur
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Si l'utilisateur n'est pas connecté, afficher un message
  if (!session?.user) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Calendrier des Événements</h1>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
          <p className="text-lg mb-4">
            Vous devez être connecté pour voir les événements.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  // Récupérer les lairs suivis par l'utilisateur
  const user = await getUserById(session.user.id);

  if (!user || !user.lairs || user.lairs.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Calendrier des Événements</h1>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
          <p className="text-lg mb-4">
            Vous ne suivez aucun lieu pour le moment. Suivez des lieux pour voir leurs événements ici.
          </p>
          <Link
            href="/lairs"
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            Découvrir les lieux
          </Link>
        </div>
      </div>
    );
  }

  // Récupérer les événements des lairs suivis
  const events = await getEventsByLairIds(user.lairs);

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
