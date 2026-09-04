import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { DeckCoverImage } from "@/components/decks/DeckCover.tsx";
import { resolveDeckCover } from "@/lib/decks/cover.ts";
import type { DeckCardInfo } from "@/lib/decks/contents.ts";
import type { Deck } from "@/lib/types/Deck.ts";

/**
 * « Decks du moment » : les trois listes les plus suivies de la semaine.
 *
 * Une rangée mise en avant plutôt qu'un carrousel : trois decks se comparent
 * d'un regard, et un défilement automatique n'aide personne à choisir.
 */
export function FeaturedDecks({
  decks,
  legendCards,
}: {
  decks: Deck[];
  /**
   * Illustrations des cartes qui servent de couverture, par identifiant. Les
   * decks dont l'auteur a déposé une image n'en ont pas besoin.
   */
  legendCards: Map<string, DeckCardInfo>;
}) {
  if (decks.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Decks du moment</h2>
        <span className="text-xs text-muted-foreground">Sept derniers jours, toutes légendes</span>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => {
          const cover = resolveDeckCover(deck, legendCards);
          const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");

          return (
            <li key={deck.id}>
              <Link
                href={`/decks/${deck.id}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Le bandeau est la couverture du deck : l'image que son
                    auteur a choisie, ou à défaut la carte qui lui donne son
                    identité. */}
                <DeckCoverImage cover={cover} name={deck.name} className="aspect-[16/7] w-full" />

                <span className="flex flex-1 flex-col gap-1 p-4">
                  <span className="text-[17px] font-semibold">{deck.name}</span>
                  {deck.legendName && (
                    <span className="text-[13px] text-muted-foreground">{deck.legendName}</span>
                  )}
                  <span className="mt-auto pt-2 text-xs text-muted-foreground">
                    ★ {deck.favoritesCount ?? 0} · {deck.views ?? 0} vues ·{" "}
                    {deck.creatorName ?? "un joueur"} · {updatedAt.toRelative()}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
