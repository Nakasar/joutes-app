import type { DeckCards, DeckCardEntry } from "@/lib/decks/contents";
import { toEngineCode } from "@/lib/engine/cards";
import type { EngineDeckList } from "@/lib/engine/types";

/** Ce qui empêche de traduire un deck Joutes en liste pour le moteur. */
export type EngineDeckProblem =
  | { kind: "noLegend" }
  | { kind: "noChampion" }
  | { kind: "unknownCard"; cardId: string };

export type EngineDeckOutcome = {
  /** Absente s'il manque la légende ou le champion choisi. */
  list: EngineDeckList | null;
  problems: EngineDeckProblem[];
};

/**
 * Traduit le contenu d'un deck Riftbound en liste pour le moteur.
 *
 * Ne juge pas le deck : les tailles de zones, les domaines et les cartes que le
 * moteur ne sait pas jouer sont vérifiés par le moteur lui-même
 * (`validate_deck`), qui est seul à connaître ses règles. Ici on ne relève que
 * ce qui empêche d'écrire la liste.
 */
export function toEngineDeck(cards: DeckCards | undefined): EngineDeckOutcome {
  const problems: EngineDeckProblem[] = [];

  const expand = (entries: DeckCardEntry[] | undefined): string[] => {
    const codes: string[] = [];
    for (const entry of entries ?? []) {
      const code = toEngineCode(entry.cardId);
      if (!code) {
        problems.push({ kind: "unknownCard", cardId: entry.cardId });
        continue;
      }
      for (let i = 0; i < Math.max(0, Math.floor(entry.quantity)); i++) {
        codes.push(code);
      }
    }
    return codes;
  };

  const legends = expand(cards?.legend);
  // Les decks d'avant la zone « Champion choisi » en rangeaient jusqu'à trois :
  // le premier est le champion choisi, les autres rejoignent le deck principal.
  const champions = expand(cards?.champions);
  const main = [...champions.slice(1), ...expand(cards?.maindeck)];
  const runes = expand(cards?.runes);
  const battlefields = expand(cards?.battlefields);

  if (legends.length === 0) problems.push({ kind: "noLegend" });
  if (champions.length === 0) problems.push({ kind: "noChampion" });

  if (legends.length === 0 || champions.length === 0) {
    return { list: null, problems };
  }

  return {
    list: { legend: legends[0], champion: champions[0], main, runes, battlefields },
    problems,
  };
}
