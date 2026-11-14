"use server";

import { deckCardIds } from "@/lib/decks/contents.ts";
import { toEngineCode } from "@/lib/engine/cards.ts";
import { guarded, playableGame, requireViewer, type PlayResult } from "@/lib/engine/table-actions.ts";
import { readableDeck, TableFailure } from "@/lib/engine/tables.ts";
import { artUrl } from "@/lib/filmed/art.ts";
import type { ReferenceCard } from "@/lib/filmed/types.ts";

/**
 * Les illustrations à apprendre pour reconnaître les cartes d'un deck sur la
 * table filmée : une par carte rangée dans le deck, variantes d'illustration
 * comprises (`OGN-042#OGN042a`), puisque c'est l'image imprimée que la caméra voit.
 */
export async function filmedArtAction(deckId: unknown): Promise<PlayResult<{ art: ReferenceCard[] }>> {
  return guarded(async () => {
    const game = await playableGame("riftbound");
    const seated = await requireViewer();
    if (typeof deckId !== "string" || !/^[a-f0-9]{24}$/i.test(deckId)) throw new TableFailure("INVALID_DECK");
    const deck = await readableDeck(deckId, seated.userId, game.id);
    const art: ReferenceCard[] = [];
    for (const cardId of deckCardIds(deck.cards)) {
      const code = toEngineCode(cardId);
      if (code) art.push({ id: `${code}#${cardId}`, url: artUrl(cardId) });
    }
    return { art };
  });
}
