import type { DeckCards, DeckCardEntry } from "@/lib/decks/contents";
import { toSwuCode } from "@/lib/engine/swu/cards";
import type { SwuDeckList, SwuKind } from "@/lib/engine/swu/types";

/** Ce qui empêche de traduire un deck Joutes en liste pour le moteur. */
export type SwuDeckProblem = "noLeader" | "noBase" | "unknownCard";

export type SwuDeckOutcome = { list: SwuDeckList | null; problems: SwuDeckProblem[] };

/**
 * Traduit le contenu d'un deck Star Wars: Unlimited en liste pour le moteur.
 *
 * Un deck Joutes ne range pas forcément le leader et la base dans une zone à
 * eux : on les reconnaît à leur type dans le moteur (`kindOf`), où qu'ils
 * soient. La réserve (`sideboard`) ne se joue pas. Le deck n'est pas jugé ici :
 * sa taille, ses exemplaires et les cartes que le moteur ne sait pas jouer sont
 * vérifiés par le moteur (`swu_validate_deck`).
 */
export function toSwuDeck(cards: DeckCards | undefined, kindOf: (code: string) => SwuKind | undefined): SwuDeckOutcome {
  const problems: SwuDeckProblem[] = [];
  const leaders: string[] = [];
  const bases: string[] = [];
  const main: string[] = [];

  for (const [zone, entries] of Object.entries(cards ?? {}) as [string, DeckCardEntry[] | undefined][]) {
    if (zone === "sideboard") continue;
    for (const entry of entries ?? []) {
      const code = toSwuCode(entry.cardId);
      const kind = code ? kindOf(code) : undefined;
      if (!code || !kind) {
        if (!problems.includes("unknownCard")) problems.push("unknownCard");
        continue;
      }
      const target = kind === "leader" ? leaders : kind === "base" ? bases : main;
      for (let i = 0; i < Math.max(0, Math.floor(entry.quantity)); i++) target.push(code);
    }
  }

  if (leaders.length === 0) problems.push("noLeader");
  if (bases.length === 0) problems.push("noBase");
  if (leaders.length === 0 || bases.length === 0) return { list: null, problems };

  // Un second leader ou une seconde base n'existe pas au format Premier : ils
  // partent avec le reste, et le moteur dira que la carte ne va pas dans un deck.
  return {
    list: { leader: leaders[0], base: bases[0], cards: [...leaders.slice(1), ...bases.slice(1), ...main] },
    problems,
  };
}
