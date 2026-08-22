import "server-only";

import { getOwnershipByName } from "@/lib/db/collection";
import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import { deckCardIds } from "@/lib/decks/contents";

/**
 * Exemplaires possédés de chaque carte du deck, par identifiant.
 *
 * La collection se compte **par nom, toutes impressions confondues** : jouer sa
 * version alternative d'une carte reste jouer cette carte, et un deck ne
 * demande pas une édition précise.
 *
 * Cette fonction ne dit que ce qu'on possède, jamais ce qu'il manque : la
 * couverture du deck se calcule à partir du contenu, qui change à chaque clic
 * dans l'éditeur (`collectionCoverage`, dans `lib/decks/contents.ts`).
 */
export async function getDeckCollectionCounts(
  userId: string,
  gameId: string,
  cards: DeckCards | undefined,
  cardsById: Map<string, DeckCardInfo>
): Promise<Map<string, number>> {
  const ids = deckCardIds(cards);
  const names = [
    ...new Set(ids.map((id) => cardsById.get(id)?.name).filter((name): name is string => Boolean(name))),
  ];

  if (names.length === 0) {
    return new Map();
  }

  const snapshot = await getOwnershipByName({ type: "user", id: userId }, gameId, names);

  const counts = new Map<string, number>();
  for (const id of ids) {
    const name = cardsById.get(id)?.name;
    counts.set(id, name ? (snapshot[name]?.total ?? 0) : 0);
  }

  return counts;
}
