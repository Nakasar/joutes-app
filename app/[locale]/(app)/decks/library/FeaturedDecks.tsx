import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import { DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
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
  /** Illustration de la légende de chaque deck, par identifiant de carte. */
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
          const legend = deck.legendCardId ? legendCards.get(deck.legendCardId) : undefined;
          const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");

          return (
            <li key={deck.id}>
              <Link
                href={`/decks/${deck.id}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="block aspect-[16/7] overflow-hidden bg-muted">
                  {legend?.image ? (
                    // Le bandeau reprend l'illustration de la légende, cadrée
                    // en bannière : c'est le visuel que les joueurs associent
                    // déjà au deck.
                    <img
                      src={legend.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover object-top"
                    />
                  ) : (
                    <DeckCardThumb name={deck.name} className="size-full rounded-none border-0" />
                  )}
                </span>

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
