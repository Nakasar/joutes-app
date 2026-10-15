import { ObjectId } from "mongodb";
import { Link } from "@/i18n/navigation.ts";
import { getAllGames } from "@/lib/db/games.ts";
import {
  countGameCards,
  getGameCard,
  getGameCardAttributeFields,
  getRecentGameCards,
} from "@/lib/db/cards.ts";
import { hasCardIndex } from "@/lib/meilisearch.ts";
import CardForm from "./CardForm.tsx";
import CardBrowser from "./CardBrowser.tsx";
import ReindexButton from "./ReindexButton.tsx";
import BulkPrintingsForm from "./BulkPrintingsForm.tsx";
import { AdminPage } from "../_components/AdminPage.tsx";
import { cn } from "@/lib/utils.ts";

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
    <AdminPage
      title="Cartes"
      description="Ajoutez une carte à un jeu ou modifiez une carte existante, avec ses attributs propres au jeu."
      width="wide"
      actions={
        selectedGame && (
          <ReindexButton
            gameId={selectedGame.id}
            gameName={selectedGame.name}
            hasSearchIndex={hasCardIndex(selectedGame.slug)}
          />
        )
      }
    >
      <nav aria-label="Jeu" className="flex flex-wrap items-center gap-1.5">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/admin/cards?gameId=${game.id}`}
            aria-current={game.id === selectedGame?.id ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
              game.id === selectedGame?.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:border-foreground/40"
            )}
          >
            {game.name}
          </Link>
        ))}
        {games.length === 0 && <p className="text-sm text-muted-foreground">Aucun jeu enregistré.</p>}
        {selectedGame && (
          <span className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{cardCount.toLocaleString("fr-FR")}</span> carte
            {cardCount === 1 ? "" : "s"} pour {selectedGame.name}
          </span>
        )}
      </nav>

      {selectedGame ? (
        // La liste à gauche, la carte en cours d'édition à droite : on passe
        // d'une carte à l'autre sans perdre la liste des yeux.
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-6">
            <CardBrowser gameId={selectedGame.id} selectedCardId={card?.id} recentCards={recentCards} />
            <BulkPrintingsForm gameId={selectedGame.id} gameName={selectedGame.name} />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {cardId && !card && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Choisissez un jeu pour ajouter ou modifier une carte.
        </div>
      )}
    </AdminPage>
  );
}
