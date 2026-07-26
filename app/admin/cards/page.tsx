import { ObjectId } from "mongodb";
import Link from "next/link";
import { getAllGames } from "@/lib/db/games";
import { getGameCardAttributeFields, getRecentGameCards } from "@/lib/db/cards";
import CardForm from "./CardForm";

export const dynamic = "force-dynamic";

export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ gameId?: string }>;
}) {
  const { gameId } = await searchParams;

  const games = (await getAllGames()).sort((a, b) => a.name.localeCompare(b.name));
  const selectedGame = games.find((game) => game.id === gameId);

  const [attributeFields, recentCards] = selectedGame
    ? await Promise.all([
        getGameCardAttributeFields(new ObjectId(selectedGame.id)),
        getRecentGameCards(new ObjectId(selectedGame.id)),
      ])
    : [[], []];

  return (
    <div className="bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des cartes</h1>
          <p className="text-gray-600">Ajoutez une carte à un jeu, avec ses attributs propres au jeu.</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Jeu</label>
          <div className="flex flex-wrap gap-2">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/admin/cards?gameId=${game.id}`}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  game.id === selectedGame?.id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:border-blue-500"
                }`}
              >
                {game.name}
              </Link>
            ))}
          </div>
          {games.length === 0 && <p className="text-sm text-gray-500">Aucun jeu enregistré.</p>}
        </div>

        {selectedGame ? (
          <>
            <CardForm
              gameId={selectedGame.id}
              gameName={selectedGame.name}
              gameSlug={selectedGame.slug}
              attributeFields={attributeFields}
            />

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Dernières cartes ajoutées</h2>
              {recentCards.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune carte pour ce jeu pour l&apos;instant.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {recentCards.map((card) => (
                    <li key={card.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                      <div className="min-w-0">
                        <Link
                          href={`/games/${selectedGame.slug ?? selectedGame.id}/cards/${card.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {card.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-gray-500">{card.id}</span>
                      </div>
                      <span className="shrink-0 text-xs text-gray-500">
                        {card.setCode} #{card.collectorNumber}
                        {card.lang ? ` · ${card.lang.toUpperCase()}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-600">
            Choisissez un jeu pour ajouter une carte.
          </div>
        )}
      </div>
    </div>
  );
}
