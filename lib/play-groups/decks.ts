import type { Deck } from "@/lib/types/Deck";
import type { PlayGroupMemberRole } from "@/lib/types/PlayGroup";
import type { PlayGroupDeck } from "@/lib/types/PlayGroupDeck";
import { canManagePlayGroup } from "./access";

/**
 * Les règles de la bibliothèque de decks d'un groupe, sans base ni session.
 *
 * Elles disent qui peut faire quoi ; les actions serveur et la route d'API les
 * appliquent, chacune après avoir lu le groupe et le deck. Garder la règle ici
 * permet de la tester une fois, et de l'appliquer à l'identique des deux côtés.
 */

export type GroupDeckRefusal = "NOT_MEMBER" | "NOT_OWNER" | "GAME_DISABLED" | "META_IMPORTED";

/**
 * Un membre peut-il partager ce deck au groupe ?
 *
 * Seul l'auteur partage ses decks : partager le deck d'un autre l'ouvrirait à
 * des gens qu'il n'a pas choisis. Un deck méta importé appartient au compte
 * qui l'a importé, mais c'est la liste d'un autre joueur : il n'a pas sa place
 * dans la bibliothèque d'un groupe.
 */
export function refuseGroupDeckAdd(input: {
  deck: Pick<Deck, "playerId" | "gameId" | "meta">;
  userId: string;
  role: PlayGroupMemberRole | null;
  isGameEnabled: boolean;
}): GroupDeckRefusal | null {
  if (!input.role) {
    return "NOT_MEMBER";
  }
  if (input.deck.playerId !== input.userId) {
    return "NOT_OWNER";
  }
  if (input.deck.meta?.imported) {
    return "META_IMPORTED";
  }
  if (!input.isGameEnabled) {
    return "GAME_DISABLED";
  }

  return null;
}

/** L'auteur retire son deck ; un admin du groupe retire celui de n'importe quel membre. */
export function canRemoveGroupDeck(
  link: Pick<PlayGroupDeck, "ownerId">,
  userId: string,
  role: PlayGroupMemberRole | null,
): boolean {
  if (!role) {
    return false;
  }

  return link.ownerId === userId || canManagePlayGroup(role);
}

/** Épingler, c'est mettre en avant pour tout le groupe : un geste d'admin. */
export function canPinGroupDeck(role: PlayGroupMemberRole | null): boolean {
  return canManagePlayGroup(role);
}

export type GroupDeckFilters = {
  gameId?: string;
  legendCardId?: string;
  ownerId?: string;
  domain?: string;
  /** Cherché dans le nom du deck et le nom de sa légende. */
  query?: string;
};

type SearchParamValue = string | string[] | undefined;

function single(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed ? trimmed : undefined;
}

/**
 * Les filtres de la vue, lus dans l'adresse.
 *
 * Les clés sont courtes et propres à la vue (`jeu`, `legende`, `membre`,
 * `domaine`, `q`) pour ne pas heurter `view` et `deck`, qui vivent dans la
 * même adresse.
 */
export function readGroupDeckFilters(params: Record<string, SearchParamValue>): GroupDeckFilters {
  const filters: GroupDeckFilters = {};
  const gameId = single(params.jeu);
  const legendCardId = single(params.legende);
  const ownerId = single(params.membre);
  const domain = single(params.domaine);
  const query = single(params.q);

  if (gameId) filters.gameId = gameId;
  if (legendCardId) filters.legendCardId = legendCardId;
  if (ownerId) filters.ownerId = ownerId;
  if (domain) filters.domain = domain;
  if (query) filters.query = query.slice(0, 80);

  return filters;
}

export type GroupDeckEntry = {
  link: PlayGroupDeck;
  deck: Pick<Deck, "id" | "name" | "gameId" | "legendCardId" | "legendName" | "domains" | "updatedAt">;
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * La bibliothèque filtrée et rangée.
 *
 * Les decks épinglés d'abord (le plus récemment épinglé en tête), puis tous
 * les autres du plus récemment modifié au plus ancien : c'est l'activité qui
 * dit quel deck mérite un regard, pas sa date d'ajout.
 */
export function filterGroupDecks<T extends GroupDeckEntry>(entries: T[], filters: GroupDeckFilters): T[] {
  const query = filters.query ? normalize(filters.query) : undefined;

  const kept = entries.filter(({ link, deck }) => {
    if (filters.gameId && deck.gameId !== filters.gameId) return false;
    if (filters.legendCardId && deck.legendCardId !== filters.legendCardId) return false;
    if (filters.ownerId && link.ownerId !== filters.ownerId) return false;
    if (filters.domain && !(deck.domains ?? []).includes(filters.domain)) return false;
    if (query) {
      const haystack = normalize(`${deck.name} ${deck.legendName ?? ""}`);
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  return kept.sort((a, b) => {
    const pinA = a.link.pinnedAt ?? "";
    const pinB = b.link.pinnedAt ?? "";
    if (pinA !== pinB) {
      return pinB.localeCompare(pinA);
    }

    return new Date(b.deck.updatedAt).getTime() - new Date(a.deck.updatedAt).getTime();
  });
}
