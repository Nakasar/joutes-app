import type { UserContentKind } from "@/lib/types/UserContent";

/**
 * Ce que deux vitrines ont en commun autour d'un contenu.
 *
 * Un groupe de jeu publie ses contenus ; un joueur publie les siens, et ceux
 * qu'il rend publics remontent sur les vitrines des groupes dont il est membre.
 * Les deux listes se mêlent, se trient et se filtrent de la même façon — c'est
 * ce que porte ce module, et il n'a besoin ni de la base ni de React pour cela.
 */

export const CONTENT_FILTERS = ["all", "video", "article", "replay"] as const;

export type ContentFilter = (typeof CONTENT_FILTERS)[number];

export function readContentFilter(value: string | undefined): ContentFilter {
  return CONTENT_FILTERS.includes(value as ContentFilter) ? (value as ContentFilter) : "all";
}

/** Ce qu'il faut d'un contenu pour le ranger. */
export type SortableContent = {
  id: string;
  kind: UserContentKind;
  publishedAt: string;
};

/**
 * Du plus récent au plus ancien.
 *
 * Les dates sont des chaînes ISO 8601 : la comparaison lexicographique suffit,
 * et évite de construire deux `Date` par comparaison sur une liste qu'on trie à
 * chaque rendu.
 */
export function sortContents<T extends SortableContent>(items: T[]): T[] {
  return [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Les contenus d'un groupe et ceux de ses membres, en une seule liste.
 *
 * Le contenu du groupe **gagne** en cas d'identifiant commun : c'est lui que le
 * groupe a choisi de mettre là, et le doublon ne peut venir que d'un contenu
 * repris. Sans cette règle, l'ordre de lecture déciderait lequel s'affiche.
 */
export function mergeContents<T extends SortableContent>(owned: T[], members: T[]): T[] {
  const seen = new Set(owned.map((item) => item.id));

  return sortContents([...owned, ...members.filter((item) => !seen.has(item.id))]);
}

/** Les contenus retenus par le filtre. */
export function filterContents<T extends SortableContent>(
  items: T[],
  filter: ContentFilter,
): T[] {
  return filter === "all" ? items : items.filter((item) => item.kind === filter);
}
