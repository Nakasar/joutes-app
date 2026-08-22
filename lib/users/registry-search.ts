import type { Document, WithId } from "mongodb";

/**
 * La lecture de ce que le registre demande.
 *
 * Une barre de saisie, des pastilles qui se cumulent, un tri, et un compteur de
 * pagination — le tout dans l'URL plutôt qu'en état local, pour qu'un registre
 * filtré se partage, se recharge et revienne intact par le bouton « précédent ».
 *
 * Module pur, sans accès à la base : `lib/db/users.ts` ouvre une connexion
 * MongoDB au chargement et ne peut donc pas être importé par un test, alors que
 * l'interprétation de la saisie est exactement ce qui mérite d'en avoir un.
 */

/**
 * Un pseudonyme peut contenir n'importe quoi, y compris ce qui a un sens dans
 * une expression régulière. Sans échappement, chercher « (test » ferait échouer
 * la requête, et « .* » balaierait toute la collection.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ce que le visiteur a désigné, une fois sa saisie interprétée. */
export type RegistryQuery =
  // Tag complet : le pseudonyme et son nombre.
  | { kind: "tag"; displayName: string; discriminator: string }
  // Fragment libre, déjà échappé : il court sur le pseudonyme **et** la ville.
  | { kind: "text"; pattern: string };

/**
 * Interprète la saisie. Rend `null` quand il n'y a rien à chercher.
 *
 * **L'identifiant n'en fait pas partie, à la différence de la recherche
 * d'administration.** Un registre public n'a pas à confirmer qu'un identifiant
 * donné correspond à un compte : c'est une information qu'on ne cherche pas, on
 * la vérifie. L'adresse e-mail est absente pour la même raison, en plus forte.
 */
export function parseRegistrySearch(term: string): RegistryQuery | null {
  const trimmed = term.trim().replace(/^@/, "").trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Le dernier « # » sépare le tag : un pseudonyme peut en contenir.
  const separator = trimmed.lastIndexOf("#");
  if (separator > 0) {
    const displayName = trimmed.slice(0, separator).trim();
    const discriminator = trimmed.slice(separator + 1).trim();

    if (displayName.length > 0 && /^\d+$/.test(discriminator)) {
      return { kind: "tag", displayName, discriminator };
    }

    // « Alice# » ou « Alice#abc » ne désignent aucun tag, et chercher la saisie
    // entière ne trouverait rien non plus. C'est le pseudonyme de gauche qu'on
    // cherche.
    if (displayName.length > 0) {
      return { kind: "text", pattern: escapeRegex(displayName) };
    }
  }

  return { kind: "text", pattern: escapeRegex(trimmed) };
}

/** Les tris proposés, dans l'ordre du menu. */
export const REGISTRY_SORTS = ["active", "followers", "name"] as const;

export type RegistrySort = (typeof REGISTRY_SORTS)[number];

export const DEFAULT_REGISTRY_SORT: RegistrySort = "active";

export function readRegistrySort(value: string | undefined): RegistrySort {
  return REGISTRY_SORTS.includes(value as RegistrySort)
    ? (value as RegistrySort)
    : DEFAULT_REGISTRY_SORT;
}

/** Combien de fiches un « charger plus » ajoute. */
export const REGISTRY_PAGE_SIZE = 20;

/**
 * Le plafond du compteur de pagination.
 *
 * Il vient de l'URL, donc de n'importe qui : sans borne, `?count=100000000`
 * ferait lire cent millions de documents pour une page. Cinq pages sont bien
 * au-delà de ce qu'on parcourt à la main — au-delà, c'est la recherche qu'il
 * faut utiliser.
 *
 * **Il doit rester égal à la borne de `searchPublicUsers`.** Un plafond plus
 * haut que ce que la lecture accepte laisserait le bouton « charger plus »
 * s'afficher sans rien ajouter.
 */
export const REGISTRY_MAX_COUNT = REGISTRY_PAGE_SIZE * 5;

export type RegistryFilters = {
  /** La saisie brute, telle qu'elle se réaffiche dans le champ. */
  q: string;
  query: RegistryQuery | null;
  gameId?: string;
  city?: string;
  /** Ne montrer que les comptes qui ont des cartes en vente. */
  sells: boolean;
  /** Ne montrer que ceux qui diffusent en ce moment. */
  live: boolean;
  sort: RegistrySort;
  count: number;
};

/** Une valeur de `searchParams`, qui peut arriver en tableau. */
type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function readRegistryFilters(params: Record<string, Param>): RegistryFilters {
  const q = first(params.q) ?? "";
  const count = Number.parseInt(first(params.count) ?? "", 10);

  return {
    q,
    query: parseRegistrySearch(q),
    gameId: first(params.game),
    city: first(params.city),
    sells: first(params.sells) === "1",
    live: first(params.live) === "1",
    sort: readRegistrySort(first(params.sort)),
    count:
      Number.isFinite(count) && count > 0
        ? Math.min(Math.ceil(count / REGISTRY_PAGE_SIZE) * REGISTRY_PAGE_SIZE, REGISTRY_MAX_COUNT)
        : REGISTRY_PAGE_SIZE,
  };
}

/** Un filtre est-il posé ? La pastille « Tous » est active quand aucun ne l'est. */
export function hasActiveFilters(filters: RegistryFilters): boolean {
  return Boolean(filters.gameId || filters.city || filters.sells || filters.live || filters.q);
}

/**
 * Les paramètres d'URL correspondant à ces filtres.
 *
 * Les valeurs par défaut sont **omises** plutôt qu'écrites : l'adresse d'un
 * registre sans filtre reste `/users`, et c'est elle qu'on partage.
 */
export function toRegistryParams(filters: Partial<RegistryFilters>): Record<string, string> {
  const params: Record<string, string> = {};

  if (filters.q) params.q = filters.q;
  if (filters.gameId) params.game = filters.gameId;
  if (filters.city) params.city = filters.city;
  if (filters.sells) params.sells = "1";
  if (filters.live) params.live = "1";
  if (filters.sort && filters.sort !== DEFAULT_REGISTRY_SORT) params.sort = filters.sort;
  if (filters.count && filters.count > REGISTRY_PAGE_SIZE) params.count = String(filters.count);

  return params;
}

/**
 * Un compte tel que le registre le montre.
 *
 * Volontairement étroit, comme `AdminUserSummary` : le document porte
 * l'e-mail, l'identifiant Discord, les amis, la position exacte et tout ce que
 * better-auth y écrit. Rien de cela n'a à traverser la frontière du serveur
 * pour afficher une liste de pseudonymes — la projection le laisse en base
 * plutôt que de compter sur l'affichage pour l'omettre.
 */
export type RegistryUser = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
  avatar?: string;
  description?: string;
  /** Au niveau de la commune, et seulement si le compte l'a autorisé. */
  city?: string;
  games: string[];
  isPublicProfile: boolean;
  createdAt?: string;
};

/**
 * La projection, convertie.
 *
 * Ici plutôt que dans `lib/db/users.ts` pour la même raison que le reste du
 * module : c'est une transformation, elle se teste.
 */
export function toRegistryUser(doc: WithId<Document>): RegistryUser {
  const showCity = doc.showcase?.showCity === true;

  return {
    id: doc._id.toString(),
    username: doc.name || doc.username || "",
    displayName: doc.displayName || undefined,
    discriminator: doc.discriminator || undefined,
    avatar: doc.profileImage || doc.image || doc.avatar || undefined,
    description: doc.description || undefined,
    city: showCity ? doc.location?.city || undefined : undefined,
    games: Array.isArray(doc.games) ? doc.games : [],
    isPublicProfile: doc.isPublicProfile === true,
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : typeof doc.createdAt === "string"
          ? doc.createdAt
          : undefined,
  };
}
