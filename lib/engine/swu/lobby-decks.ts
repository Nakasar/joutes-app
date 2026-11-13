import "server-only";

import type { LobbyDeck, LobbyDeckSource } from "@/lib/engine/lobby-decks";
import { toSwuCode } from "@/lib/engine/swu/cards";
import { toSwuDeck } from "@/lib/engine/swu/deck";
import { swuEngineCards, validateSwuDeck } from "@/lib/engine/swu/server";
import type { SwuDeckList } from "@/lib/engine/swu/types";
import type { Deck } from "@/lib/types/Deck";

/**
 * Un deck Star Wars: Unlimited tel que la page Jouer le propose : la même
 * fiche que pour Riftbound (`legend` porte le code du leader, `domains` les
 * aspects du leader et de la base), avec la liste du moteur SWU.
 */
export type SwuLobbyDeck = Omit<LobbyDeck, "list" | "completed"> & { list: SwuDeckList | null };

const kindOf = (code: string) => swuEngineCards().get(code)?.kind;

/** Un deck Joutes traduit pour le moteur et vérifié par lui. */
export function swuDeckOf(deck: Pick<Deck, "cards">): { list: SwuDeckList | null; problems: string[]; leader: string | null } {
  const { list, problems } = toSwuDeck(deck.cards, kindOf);
  if (!list) {
    // La vignette garde le leader d'un deck sans base.
    const leader = Object.values(deck.cards ?? {})
      .flat()
      .map((entry) => (entry ? toSwuCode(entry.cardId) : null))
      .find((code) => code && kindOf(code) === "leader");
    return { list: null, problems, leader: leader ?? null };
  }
  const refused = [...problems, ...validateSwuDeck(list)];
  return refused.length === 0
    ? { list, problems: [], leader: list.leader }
    : { list: null, problems: refused, leader: list.leader };
}

export function toSwuLobbyDeck(deck: Deck, source: LobbyDeckSource, groups?: string[]): SwuLobbyDeck {
  const { list, problems, leader } = swuDeckOf(deck);
  const cards = swuEngineCards();
  const aspects = list ? [...(cards.get(list.leader)?.aspects ?? []), ...(cards.get(list.base)?.aspects ?? [])] : [];
  return {
    id: deck.id,
    name: deck.name,
    source,
    legend: leader,
    ...(aspects.length ? { domains: [...new Set(aspects)] } : {}),
    ...(source !== "mine" && deck.creatorName ? { author: deck.creatorName } : {}),
    ...(groups?.length ? { groups } : {}),
    ...(deck.favoritesCount ? { favorites: deck.favoritesCount } : {}),
    ...(deck.updatedAt ? { updatedAt: new Date(deck.updatedAt).toISOString() } : {}),
    list,
    problems,
  };
}

/** Les leaders et les bases autour desquels le moteur sait construire un deck automatique. */
export function swuAutoDeckCards(): { leaders: string[]; bases: string[] } {
  const playable = [...swuEngineCards().values()].filter((card) => card.coverage !== "none");
  return {
    leaders: playable.filter((card) => card.kind === "leader").map((card) => card.code),
    bases: playable.filter((card) => card.kind === "base").map((card) => card.code),
  };
}
