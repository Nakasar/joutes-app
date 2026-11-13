import "server-only";

import { getDecksByIds, searchDecks } from "@/lib/db/decks.ts";
import { listPlayGroupDecksOfGroups } from "@/lib/db/play-group-decks.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import type { DeckCompletion } from "@/lib/engine/complete-deck.ts";
import { toEngineCode } from "@/lib/engine/cards.ts";
import { toEngineDeck } from "@/lib/engine/deck.ts";
import { engineDeckOf } from "@/lib/engine/playable-deck.ts";
import { engineTags } from "@/lib/engine/server.ts";
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
  /** Pour un deck méta : le tournoi et la place, « Top 8 · Regional Lyon ». */
  tournament?: string;
  /** Les groupes où le deck m'est partagé. */
  groups?: string[];
  favorites?: number;
  /** ISO 8601. */
  updatedAt?: string;
  /** Absente si le deck ne peut pas être joué ; `problems` dit pourquoi. */
  list: EngineDeckList | null;
  problems: string[];
  /** Ce que le moteur a reçu en plus du deck rangé (deck méta importé du locator). */
  completed?: DeckCompletion[];
};

/** Un deck Joutes tel que la page Jouer le propose : traduit et vérifié par le moteur. */
export function toLobbyDeck(deck: Deck, source: LobbyDeckSource, groups?: string[]): LobbyDeck {
  // Un deck méta importé s'affiche au nom de son joueur, pas du compte qui l'a importé.
  const author = deck.meta?.imported && deck.meta.pilot ? deck.meta.pilot : deck.creatorName;
  const base = {
    id: deck.id,
    name: deck.name,
    source,
    ...(deck.legendName ? { legendName: deck.legendName } : {}),
    ...(deck.domains?.length ? { domains: deck.domains } : {}),
    ...(source !== "mine" && author ? { author } : {}),
    ...(deck.meta ? { tournament: [deck.meta.placement, deck.meta.source].filter(Boolean).join(" · ") } : {}),
    ...(groups?.length ? { groups } : {}),
    ...(deck.favoritesCount ? { favorites: deck.favoritesCount } : {}),
    ...(deck.updatedAt ? { updatedAt: new Date(deck.updatedAt).toISOString() } : {}),
  };
  const { list, problems, completed } = engineDeckOf(deck);
  // La vignette garde la légende d'un deck refusé, s'il en a une.
  const first = deck.cards?.legend?.[0]?.cardId;
  const legend = list?.legend ?? toEngineDeck(deck.cards, engineTags).list?.legend ?? (first ? toEngineCode(first) : null);
  return { ...base, legend, list, problems, ...(completed.length > 0 ? { completed } : {}) };
}

/**
 * Comment un deck Joutes devient un deck proposé : celui de Riftbound par
 * défaut, celui d'un autre jeu du moteur sinon.
 */
type Convert<D> = (deck: Deck, source: LobbyDeckSource, groups?: string[]) => D;

/** Combien de decks publics la page propose d'emblée, et par recherche. */
const PUBLIC_DECKS = 20;

export async function publicDecks<D = LobbyDeck>(
  gameId: string,
  viewerId: string | null,
  search?: string,
  count = PUBLIC_DECKS,
  convert: Convert<D> = toLobbyDeck as Convert<D>,
): Promise<D[]> {
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
    .map((deck) => convert(deck, deck.meta ? "meta" : "public"));
}

/** Combien de decks méta les combobox proposent d'emblée ; les autres se trouvent par la recherche. */
export const META_PICKER_DECKS = 60;

/** Plusieurs listes en une : un deck présent deux fois reste dans la première où il apparaît. */
export function mergeLobbyDecks<D extends { id: string } = LobbyDeck>(...lists: D[][]): D[] {
  const seen = new Set<string>();
  return lists.flat().filter((deck) => {
    if (seen.has(deck.id)) return false;
    seen.add(deck.id);
    return true;
  });
}

/** Les decks partagés dans mes groupes, sauf les miens. */
export async function sharedDecks<D = LobbyDeck>(
  userId: string,
  gameId: string,
  convert: Convert<D> = toLobbyDeck as Convert<D>,
): Promise<D[]> {
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
    .map((deck) => convert(deck, "shared", groupsOf.get(deck.id)));
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
