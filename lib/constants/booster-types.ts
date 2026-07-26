/**
 * Types de boosters proposés à la création / modification d'un booster. Les
 * produits dépendent du jeu (un « Carbonite » n'existe que sur Star Wars
 * Unlimited), donc la liste est indexée par slug de jeu. `other` est toujours
 * proposé en dernier, et sert de valeur par défaut.
 *
 * Les clés sont à la fois la valeur stockée en base et la clé de traduction
 * (`Collection.boosters.types.<clé>`).
 */
export const OTHER_BOOSTER_TYPE = "other";

const BOOSTER_TYPES_BY_GAME: Record<string, readonly string[]> = {
  riftbound: ["pre-rift", "booster"],
  swu: ["booster", "carbonite", "pre-release"],
  mtg: ["play-booster", "set-booster", "collector", "pre-release"],
  altered: ["booster", "collector"],
};

/** Types traduits : toute autre valeur stockée est affichée telle quelle. */
export const KNOWN_BOOSTER_TYPES: readonly string[] = [
  ...new Set([...Object.values(BOOSTER_TYPES_BY_GAME).flat(), OTHER_BOOSTER_TYPE]),
];

/**
 * Les boosters créés avant l'ajout des types portent `custom` : on les affiche
 * comme des « Autre », qui recouvre exactement le même cas.
 */
export function normalizeBoosterType(type?: string): string {
  const trimmed = type?.trim();
  if (!trimmed || trimmed === "custom") {
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
  return type === OTHER_BOOSTER_TYPE ? [OTHER_BOOSTER_TYPE, "custom"] : [type];
}

/** Types proposés pour un jeu, `other` compris. */
export function getBoosterTypes(gameSlug?: string): string[] {
  return [...(BOOSTER_TYPES_BY_GAME[gameSlug ?? ""] ?? []), OTHER_BOOSTER_TYPE];
}

export function isBoosterType(gameSlug: string | undefined, type: string): boolean {
  return getBoosterTypes(gameSlug).includes(type);
}

/**
 * Options d'un sélecteur : les types du jeu, précédés de la valeur courante si
 * elle n'en fait pas partie (type retiré de la liste depuis, ou booster créé
 * sur un autre jeu), pour ne pas la perdre silencieusement à l'enregistrement.
 */
export function getBoosterTypeOptions(gameSlug: string | undefined, current?: string): string[] {
  const types = getBoosterTypes(gameSlug);
  const normalized = normalizeBoosterType(current);
  return types.includes(normalized) ? types : [normalized, ...types];
}
