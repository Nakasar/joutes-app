import type { DeckCards, DeckCardEntry } from "@/lib/decks/contents";
import { startingLegendIndex, wantsExtraLegends } from "@/lib/decks/extra-legends";
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
 *
 * `tagsOf` rend les tags d'une carte du moteur : avec plusieurs légendes
 * (Neeko), il désigne celle du champion choisi comme légende de départ, sans se
 * fier à l'ordre dans lequel le deck les range.
 */
export function toEngineDeck(
  cards: DeckCards | undefined,
  tagsOf?: (code: string) => readonly string[] | undefined
): EngineDeckOutcome {
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

  // Neeko, Blending In : les légendes autres que celle de départ sont celles
  // qu'elle peut ajouter. Le moteur juge leur nombre et leurs noms. Sans Neeko,
  // une légende en trop n'est pas envoyée : c'est la taille de la zone qui est
  // fausse, et le deck se joue avec sa légende de départ.
  const start = tagsOf ? startingLegendIndex(legends, champions[0], tagsOf) : 0;
  const extra = wantsExtraLegends(cards) ? legends.filter((_, index) => index !== start) : [];

  return {
    list: {
      legend: legends[start],
      champion: champions[0],
      main,
      runes,
      battlefields,
      ...(extra.length > 0 ? { extra_legends: extra } : {}),
    },
    problems,
  };
}
