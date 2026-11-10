import "server-only";

import { isDeckSharedWithUser } from "@/lib/db/play-group-decks";
import type { Deck } from "@/lib/types/Deck";
import { canReadDeck, needsShareLookup } from "./access";

/**
 * Le lecteur peut-il ouvrir ce deck ? La règle est dans `access.ts` ; ici, on
 * ne lit les partages en base que lorsque la réponse en dépend — le deck privé
 * de quelqu'un d'autre.
 */
export async function readDeckAccess(
  deck: Pick<Deck, "id" | "visibility" | "playerId">,
  userId: string | null | undefined,
): Promise<boolean> {
  const shared = needsShareLookup(deck, userId) && userId ? await isDeckSharedWithUser(deck.id, userId) : false;

  return canReadDeck(deck, userId, shared);
}
