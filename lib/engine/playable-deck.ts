import "server-only";

import { completeEngineDeck, type CompletedDeck, type CompletionCatalog } from "@/lib/engine/complete-deck.ts";
import { toEngineDeck } from "@/lib/engine/deck.ts";
import { autoEngineDeck, engineCards, engineTags, validateEngineDeck } from "@/lib/engine/server.ts";
import type { Deck } from "@/lib/types/Deck.ts";

const champions = new Map<string, string[]>();

const completion: CompletionCatalog = {
  tagsOf: engineTags,
  championsOf: (legend) => {
    let found = champions.get(legend);
    if (!found) {
      // Le champion choisi porte le tag de la légende (règle 103.3.a.2).
      const tag = engineCards().get(legend)?.tags[0];
      found = tag
        ? [...engineCards().values()]
            .filter((card) => card.kind === "unit" && card.champion && !card.token && card.coverage !== "none")
            .filter((card) => card.tags.includes(tag))
            .map((card) => card.code)
            .sort()
        : [];
      champions.set(legend, found);
    }
    return found;
  },
  battlefieldsFor: (legend) => autoEngineDeck(legend, 1)?.battlefields ?? [],
  validate: validateEngineDeck,
};

/**
 * Un deck Joutes traduit et vérifié par le moteur. Un deck méta importé du
 * locator n'a ni champion choisi ni champs de bataille : le moteur les reçoit
 * complétés (`completed` dit lesquels), le deck rangé ne change pas.
 */
export function engineDeckOf(deck: Pick<Deck, "cards" | "meta">): CompletedDeck {
  if (deck.meta?.imported) return completeEngineDeck(deck.cards, completion);
  const { list, problems } = toEngineDeck(deck.cards, engineTags);
  if (!list) return { list: null, problems: problems.map((problem) => problem.kind), completed: [] };
  const refused = validateEngineDeck(list);
  return refused.length === 0 ? { list, problems: [], completed: [] } : { list: null, problems: refused, completed: [] };
}
