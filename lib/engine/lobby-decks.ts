import "server-only";

import { getDecksByIds, searchDecks } from "@/lib/db/decks.ts";
import { listPlayGroupDecksOfGroups } from "@/lib/db/play-group-decks.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import { toEngineDeck } from "@/lib/engine/deck.ts";
import { engineTags, validateEngineDeck } from "@/lib/engine/server.ts";
import type { EngineDeckList } from "@/lib/engine/types.ts";
import type { Deck } from "@/lib/types/Deck.ts";

/**
 * Les decks Joutes que les pages Jouer et Simuler proposent : traduits pour le
 * moteur et vérifiés par lui.
 */

/** D'où vient un deck proposé à la table : à moi, partagé dans un de mes groupes, public, ou deck méta. */
export type LobbyDeckSource = "mine" | "shared" | "public" | "meta";

export type LobbyDeck = {
  id: string;
  name: string;
  source: LobbyDeckSource;
  /** Code moteur de la légende, pour la vignette. */
  legend: string | null;
  /** Le nom de la légende tel que le deck le range, pour la recherche. */
  legendName?: string;
  domains?: string[];
  /** L'auteur, pour un deck qui n'est pas à moi. */
  author?: string;
  /** Les groupes où le deck m'est partagé. */
  groups?: string[];
  favorites?: number;
  /** ISO 8601. */
  updatedAt?: string;
  /** Absente si le deck ne peut pas être joué ; `problems` dit pourquoi. */
  list: EngineDeckList | null;
  problems: string[];
};

/** Un deck Joutes tel que la page Jouer le propose : traduit et vérifié par le moteur. */
export function toLobbyDeck(deck: Deck, source: LobbyDeckSource, groups?: string[]): LobbyDeck {
  const base = {
    id: deck.id,
    name: deck.name,
    source,
    ...(deck.legendName ? { legendName: deck.legendName } : {}),
    ...(deck.domains?.length ? { domains: deck.domains } : {}),
    ...(source !== "mine" && deck.creatorName ? { author: deck.creatorName } : {}),
    ...(groups?.length ? { groups } : {}),
    ...(deck.favoritesCount ? { favorites: deck.favoritesCount } : {}),
    ...(deck.updatedAt ? { updatedAt: new Date(deck.updatedAt).toISOString() } : {}),
  };
  const { list, problems } = toEngineDeck(deck.cards, engineTags);
  if (!list) {
    return { ...base, legend: null, list: null, problems: problems.map((p) => p.kind) };
  }
  const refused = validateEngineDeck(list);
  return { ...base, legend: list.legend, list: refused.length === 0 ? list : null, problems: refused };
}

/** Combien de decks publics la page propose d'emblée, et par recherche. */
const PUBLIC_DECKS = 20;

export async function publicDecks(
  gameId: string,
  viewerId: string | null,
  search?: string,
  count = PUBLIC_DECKS,
): Promise<LobbyDeck[]> {
  const { decks } = await searchDecks({
    gameId,
    scope: "public",
    ...(search ? { search } : {}),
    sortBy: "favoritesCount",
    sortOrder: "desc",
    limit: count + 10,
  });
  return decks
    .filter((deck) => deck.playerId !== viewerId)
    .slice(0, count)
    .map((deck) => toLobbyDeck(deck, "public"));
}

/** Les decks partagés dans mes groupes, sauf les miens. */
export async function sharedDecks(userId: string, gameId: string): Promise<LobbyDeck[]> {
  const groups = await getPlayGroupsForUser(userId);
  const links = await listPlayGroupDecksOfGroups(
    groups.map((group) => group.id),
    gameId,
    200,
  );
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const groupsOf = new Map<string, string[]>();
  for (const link of links) {
    if (link.ownerId === userId) continue;
    const names = groupsOf.get(link.deckId) ?? [];
    const name = groupName.get(link.playGroupId);
    if (name && !names.includes(name)) names.push(name);
    groupsOf.set(link.deckId, names);
  }
  const ids = [...groupsOf.keys()].slice(0, 100);
  const decks = await getDecksByIds(ids);
  return decks
    .filter((deck) => deck.gameId === gameId && deck.playerId !== userId)
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .map((deck) => toLobbyDeck(deck, "shared", groupsOf.get(deck.id)));
}

/**
 * Les decks méta les plus récents (par date de tournoi) : autant d'exemplaires
 * d'une légende qu'elle a de decks en tournoi.
 */
export async function metaDecks(gameId: string, count: number): Promise<LobbyDeck[]> {
  const { decks } = await searchDecks({
    gameId,
    scope: "public",
    metaOnly: true,
    sortBy: "meta.eventDate",
    sortOrder: "desc",
    limit: count,
  });
  return decks.map((deck) => toLobbyDeck(deck, "meta"));
}
