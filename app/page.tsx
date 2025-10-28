import { getEventsByLairIds } from "@/lib/db/events";
import { getLairById } from "@/lib/db/lairs";
import { Lair } from "@/lib/types/Lair";
import EventsCalendar from "@/app/events/EventsCalendar";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { getUserById } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";

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

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Calendrier des Événements</h1>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <p className="text-lg mb-4">
            Erreur lors de la récupération de votre profil.
          </p>
        </div>
      </div>
    );
  }

  // Vérifier si l'utilisateur suit des lieux et des jeux
  const hasLairs = user.lairs && user.lairs.length > 0;
  const hasGames = user.games && user.games.length > 0;

  if (!hasLairs || !hasGames) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Calendrier des Événements</h1>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
          <p className="text-lg mb-4">
            {!hasLairs && !hasGames && "Vous ne suivez aucun lieu ni aucun jeu pour le moment."}
            {!hasLairs && hasGames && "Vous ne suivez aucun lieu pour le moment."}
            {hasLairs && !hasGames && "Vous ne suivez aucun jeu pour le moment."}
          </p>
          <p className="text-base mb-4 text-gray-600 dark:text-gray-400">
            Suivez des lieux et des jeux pour voir leurs événements ici.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            {!hasLairs && (
              <Link
                href="/lairs"
                className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                Découvrir les lieux
              </Link>
            )}
            {!hasGames && (
              <Link
                href="/account"
                className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                Suivre des jeux
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Récupérer tous les jeux pour obtenir leurs noms
  const allGames = await getAllGames();
  const followedGameNames = allGames
    .filter(game => user.games.includes(game.id))
    .map(game => game.name);

  // Récupérer les événements des lairs suivis
  const allEvents = await getEventsByLairIds(user.lairs);

  // Filtrer les événements par les jeux suivis
  const events = allEvents.filter(event =>
    followedGameNames.includes(event.gameName)
  );

  // Récupérer les détails des lairs suivis
  const lairsDetails = await Promise.all(
    user.lairs.map(lairId => getLairById(lairId))
  );
  const lairs = lairsDetails.filter((lair): lair is Lair => lair !== null);

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
