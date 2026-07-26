/**
 * Champs portés par toutes les cartes, quel que soit le jeu. Ils ont leur
 * propre saisie et leur propre validation : ils sont donc exclus des attributs
 * de jeu, aussi bien de ceux relevés en base que de ceux saisis à la main.
 */
export const CORE_CARD_KEYS = [
  "_id",
  "gameId",
  "id",
  "cardId",
  "name",
  "setCode",
  "collectorNumber",
  "lang",
  "image",
  "text",
] as const;

/**
 * Provenance d'une carte, écrite par l'application : `source` distingue une
 * carte ajoutée à la main d'une carte issue d'un script d'import (les cartes
 * importées n'ont pas le champ), et les marqueurs d'édition disent si et quand
 * une carte a été retouchée à la main.
 */
export const CARD_PROVENANCE_KEYS = [
  "source",
  "createdBy",
  "createdAt",
  "manuallyEditedAt",
  "manuallyEditedBy",
] as const;

/** Champs pilotés par d'autres écrans (le bannissement a son propre bouton sur la fiche). */
export const CARD_MANAGED_KEYS = ["banned"] as const;

/** Champs qu'un attribut de jeu ne peut ni porter ni écraser. */
export const RESERVED_CARD_KEYS: readonly string[] = [
  ...CORE_CARD_KEYS,
  ...CARD_PROVENANCE_KEYS,
  ...CARD_MANAGED_KEYS,
];

export function isReservedCardKey(key: string): boolean {
  return RESERVED_CARD_KEYS.includes(key);
}

export type CardSource = "manual" | "import";
