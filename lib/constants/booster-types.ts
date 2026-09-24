import type { Game, GameBoosterType } from "@/lib/types/Game";

/**
 * Types de boosters proposés à la création / modification d'un booster. Les
 * produits dépendent du jeu (un « Carbonite » n'existe que sur Star Wars
 * Unlimited) : chaque jeu porte sa liste, réglée depuis `/admin/games`
 * (`Game.boosterTypes`). `other` est toujours proposé en dernier, et sert de
 * valeur par défaut.
 *
 * Les clés sont la valeur stockée en base. Pour les types connus de
 * l'application, elles sont aussi la clé de traduction
 * (`Collection.boosters.types.<clé>`) ; un libellé saisi dans l'administration
 * prend le pas sur la traduction.
 */
export const OTHER_BOOSTER_TYPE = "other";

/** Valeur des boosters créés avant l'ajout des types, lue comme `other`. */
const LEGACY_OTHER_BOOSTER_TYPE = "custom";

/**
 * Listes livrées avec la plateforme, suivies par un jeu tant que
 * l'administration ne lui en a pas réglé une.
 */
const DEFAULT_BOOSTER_TYPES_BY_GAME: Record<string, readonly string[]> = {
  riftbound: ["pre-rift", "booster"],
  swu: ["booster", "carbonite", "pre-release"],
  mtg: ["play-booster", "set-booster", "collector", "pre-release"],
  altered: ["booster", "collector"],
  fab: ["booster", "pre-release"],
};

/** Types traduits : toute autre valeur stockée est affichée telle quelle. */
export const KNOWN_BOOSTER_TYPES: readonly string[] = [
  ...new Set([...Object.values(DEFAULT_BOOSTER_TYPES_BY_GAME).flat(), OTHER_BOOSTER_TYPE]),
];

/** Clés qu'un jeu ne peut pas déclarer : elles désignent déjà « Autre ». */
export const RESERVED_BOOSTER_TYPE_KEYS: readonly string[] = [OTHER_BOOSTER_TYPE, LEGACY_OTHER_BOOSTER_TYPE];

/** Forme d'une clé : minuscules, chiffres et tirets, comme les clés connues. */
export const BOOSTER_TYPE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type BoosterTypesSource = Pick<Game, "slug" | "boosterTypes"> | null | undefined;

/**
 * Les boosters créés avant l'ajout des types portent `custom` : on les affiche
 * comme des « Autre », qui recouvre exactement le même cas.
 */
export function normalizeBoosterType(type?: string): string {
  const trimmed = type?.trim();
  if (!trimmed || trimmed === LEGACY_OTHER_BOOSTER_TYPE) {
    return OTHER_BOOSTER_TYPE;
  }
  return trimmed;
}

/**
 * Valeurs stockées correspondant à un type affiché : « Autre » recouvre aussi
 * le `custom` des boosters créés avant l'ajout des types, filtrer dessus doit
 * donc les inclure.
 */
export function boosterTypeStoredValues(type: string): string[] {
  return type === OTHER_BOOSTER_TYPE ? [OTHER_BOOSTER_TYPE, LEGACY_OTHER_BOOSTER_TYPE] : [type];
}

/** La liste livrée avec la plateforme pour un jeu, `other` exclu. */
export function getDefaultBoosterTypes(gameSlug?: string): string[] {
  return [...(DEFAULT_BOOSTER_TYPES_BY_GAME[gameSlug ?? ""] ?? [])];
}

/**
 * Les types d'un jeu tels que réglés, `other` exclu : ceux de l'administration
 * s'il y en a (même une liste vide), la liste livrée sinon.
 */
export function getGameBoosterTypes(game: BoosterTypesSource): GameBoosterType[] {
  if (game?.boosterTypes) {
    return game.boosterTypes.filter((type) => !RESERVED_BOOSTER_TYPE_KEYS.includes(type.key));
  }
  return getDefaultBoosterTypes(game?.slug).map((key) => ({ key }));
}

/** Types proposés pour un jeu, `other` compris et en dernier. */
export function getBoosterTypes(game: BoosterTypesSource): string[] {
  return [...getGameBoosterTypes(game).map((type) => type.key), OTHER_BOOSTER_TYPE];
}

export function isBoosterType(game: BoosterTypesSource, type: string): boolean {
  return getBoosterTypes(game).includes(type);
}

/**
 * Libellés saisis dans l'administration, par clé. Les types sans libellé n'y
 * figurent pas : ils retombent sur la traduction, ou sur leur clé.
 */
export function getBoosterTypeLabels(game: BoosterTypesSource): Record<string, string> {
  return Object.fromEntries(
    getGameBoosterTypes(game).flatMap((type) => (type.label ? [[type.key, type.label]] : [])),
  );
}

/**
 * Options d'un sélecteur : les types du jeu, précédés de la valeur courante si
 * elle n'en fait pas partie (type retiré de la liste depuis, ou booster créé
 * sur un autre jeu), pour ne pas la perdre silencieusement à l'enregistrement.
 */
export function getBoosterTypeOptions(types: string[], current?: string): string[] {
  const normalized = normalizeBoosterType(current);
  return types.includes(normalized) ? types : [normalized, ...types];
}
