import type { DeckCards, DeckCardEntry } from "@/lib/decks/contents";
import { toCpCode } from "@/lib/engine/cyberpunk/cards";
import type { CpDeckList, CpKind } from "@/lib/engine/cyberpunk/types";

/** Ce qui empêche de traduire un deck Joutes en liste pour le moteur. */
export type CpDeckProblem = "noLegends" | "unknownCard";

export type CpDeckOutcome = { list: CpDeckList | null; problems: CpDeckProblem[] };

/**
 * Traduit le contenu d'un deck Cyberpunk TCG en liste pour le moteur.
 *
 * Le deck builder ne range pas les Légendes dans une zone à elles : on les
 * reconnaît à leur type dans le moteur (`kindOf`), où qu'elles soient. La
 * réserve (`sideboard`) ne se joue pas. Le deck n'est pas jugé ici : nombre de
 * Légendes, taille, exemplaires et RAM sont vérifiés par le moteur
 * (`cp_validate_deck`).
 */
export function toCpDeck(cards: DeckCards | undefined, kindOf: (code: string) => CpKind | undefined): CpDeckOutcome {
  const problems: CpDeckProblem[] = [];
  const legends: string[] = [];
  const main: string[] = [];
  const known = (code: string) => kindOf(code) !== undefined;

  for (const [zone, entries] of Object.entries(cards ?? {}) as [string, DeckCardEntry[] | undefined][]) {
    if (zone === "sideboard") continue;
    for (const entry of entries ?? []) {
      const code = toCpCode(entry.cardId, known);
      const kind = code ? kindOf(code) : undefined;
      if (!code || !kind) {
        if (!problems.includes("unknownCard")) problems.push("unknownCard");
        continue;
      }
      const target = kind === "legend" ? legends : main;
      for (let i = 0; i < Math.max(0, Math.floor(entry.quantity)); i++) target.push(code);
    }
  }

  if (legends.length === 0) return { list: null, problems: [...problems, "noLegends"] };
  return { list: { legends, cards: main }, problems };
}
