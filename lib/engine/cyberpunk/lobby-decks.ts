import "server-only";

import type { LobbyDeck, LobbyDeckSource } from "@/lib/engine/lobby-decks";
import { toCpDeck } from "@/lib/engine/cyberpunk/deck";
import { cpEngineCards, validateCpDeck } from "@/lib/engine/cyberpunk/server";
import type { CpDeckList } from "@/lib/engine/cyberpunk/types";
import type { Deck } from "@/lib/types/Deck";

/**
 * Un deck Cyberpunk TCG tel que la page Jouer le propose : la même fiche que
 * pour Riftbound (`legend` porte la première de ses Légendes, `domains` les
 * couleurs de ses Légendes), avec la liste du moteur.
 */
export type CpLobbyDeck = Omit<LobbyDeck, "list" | "completed"> & { list: CpDeckList | null };

const kindOf = (code: string) => cpEngineCards().get(code)?.kind;

/** Un deck Joutes traduit pour le moteur et vérifié par lui. */
export function cpDeckOf(deck: Pick<Deck, "cards">): { list: CpDeckList | null; problems: string[]; legends: string[] } {
  const { list, problems } = toCpDeck(deck.cards, kindOf);
  if (!list) return { list: null, problems, legends: [] };
  const refused = [...problems, ...validateCpDeck(list)];
  return refused.length === 0
    ? { list, problems: [], legends: list.legends }
    : { list: null, problems: refused, legends: list.legends };
}

export function toCpLobbyDeck(deck: Deck, source: LobbyDeckSource, groups?: string[]): CpLobbyDeck {
  const { list, problems, legends } = cpDeckOf(deck);
  const cards = cpEngineCards();
  const colors = [...new Set(legends.map((code) => cards.get(code)?.color).filter(Boolean))] as string[];
  const names = legends.map((code) => cards.get(code)?.name).filter(Boolean);
  return {
    id: deck.id,
    name: deck.name,
    source,
    legend: legends[0] ?? null,
    // La recherche trouve un deck par chacune de ses Légendes.
    ...(names.length ? { legendName: names.join(" · ") } : {}),
    ...(colors.length ? { domains: colors } : {}),
    ...(source !== "mine" && deck.creatorName ? { author: deck.creatorName } : {}),
    ...(groups?.length ? { groups } : {}),
    ...(deck.favoritesCount ? { favorites: deck.favoritesCount } : {}),
    ...(deck.updatedAt ? { updatedAt: new Date(deck.updatedAt).toISOString() } : {}),
    list,
    problems,
  };
}
