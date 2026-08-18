import { ObjectId } from "mongodb";
import { Link } from "@/i18n/navigation";
import { getAllGames } from "@/lib/db/games";
import {
  countGameCards,
  getGameCard,
  getGameCardAttributeFields,
  getRecentGameCards,
} from "@/lib/db/cards";
import { hasCardIndex } from "@/lib/meilisearch";
import CardForm from "./CardForm";
import CardBrowser from "./CardBrowser";
import ReindexButton from "./ReindexButton";
import BulkPrintingsForm from "./BulkPrintingsForm";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ gameId?: string; cardId?: string }>;
}) {
  const { gameId, cardId } = await searchParams;

  const games = (await getAllGames()).sort((a, b) => a.name.localeCompare(b.name));
  const selectedGame = games.find((game) => game.id === gameId);

  const [attributeFields, recentCards, cardCount, card] = selectedGame
    ? await Promise.all([
        getGameCardAttributeFields(new ObjectId(selectedGame.id)),
        getRecentGameCards(new ObjectId(selectedGame.id)),
        countGameCards(new ObjectId(selectedGame.id)),
        cardId ? getGameCard(new ObjectId(selectedGame.id), cardId) : Promise.resolve(null),
      ])
    : [[], [], 0, null];

  return (
    <div className="bg-muted/50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestion des cartes</h1>
          <p className="text-muted-foreground">
            Ajoutez une carte à un jeu ou modifiez une carte existante, avec ses attributs propres au jeu.
          </p>
        </div>

        <div className="bg-card rounded-lg shadow-md p-6 space-y-3">
          <label className="block text-sm font-medium text-foreground">Jeu</label>
          <div className="flex flex-wrap gap-2">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/admin/cards?gameId=${game.id}`}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  game.id === selectedGame?.id
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "border-input text-foreground hover:border-blue-500"
                }`}
              >
                {game.name}
              </Link>
            ))}
          </div>
          {games.length === 0 && <p className="text-sm text-muted-foreground">Aucun jeu enregistré.</p>}

          {selectedGame && (
            <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{cardCount}</span> carte{cardCount === 1 ? "" : "s"} pour{" "}
                {selectedGame.name}.
              </p>
              <ReindexButton
                gameId={selectedGame.id}
                gameName={selectedGame.name}
                hasSearchIndex={hasCardIndex(selectedGame.slug)}
              />
            </div>
          )}
        </div>

        {selectedGame ? (
          <>
            <CardBrowser gameId={selectedGame.id} selectedCardId={card?.id} recentCards={recentCards} />

            <BulkPrintingsForm gameId={selectedGame.id} gameName={selectedGame.name} />

            {cardId && !card && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                Aucune carte « {cardId} » pour ce jeu.
              </div>
            )}

            <CardForm
              // Le formulaire garde son état localement : changer de jeu ou de
              // carte doit le remonter à neuf, pas mélanger les saisies.
              key={`${selectedGame.id}:${card?.id ?? "new"}`}
              gameId={selectedGame.id}
              gameName={selectedGame.name}
              gameSlug={selectedGame.slug}
              attributeFields={attributeFields}
              card={card ?? undefined}
            />
          </>
        ) : (
          <div className="bg-card rounded-lg shadow-md p-6 text-sm text-muted-foreground">
            Choisissez un jeu pour ajouter ou modifier une carte.
          </div>
        )}
      </div>
    </div>
  );
}
