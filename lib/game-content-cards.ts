import "server-only";

import { ObjectId } from "mongodb";
import { extractBracketedMentions } from "@/lib/errata-markdown";
import { CardNameMatch, getCardsByNames } from "@/lib/db/cards";

/**
 * Scans a batch of markdown texts (policies, news, ...) for `[Card Name]`
 * bracket mentions and resolves them against a single game's cards, for
 * `GameMarkdown`/`AnnotatedMarkdown` to turn into card-name popovers.
 */
export async function resolveCardMentions(
  gameId: ObjectId,
  texts: string[]
): Promise<{ cardIdByName: Record<string, string>; cardsById: Record<string, CardNameMatch> }> {
  const names = [...new Set(texts.flatMap((text) => extractBracketedMentions(text)))];
  const cards = await getCardsByNames(gameId, names);

  return {
    cardIdByName: Object.fromEntries(cards.map((c) => [c.name.toLowerCase(), c.id])),
    cardsById: Object.fromEntries(cards.map((c) => [c.id, c])),
  };
}
