/**
 * Les blocs de la vitrine d'un profil, dans leur ordre par défaut.
 *
 * Même mécanique que `lib/lairs/sections.ts`, et pour les mêmes raisons :
 * l'ordre stocké est une liste de clés, un compte qui n'a rien réordonné n'a
 * rien en base et suit celui-ci. Ajouter un bloc plus tard le place donc à sa
 * position par défaut chez tout le monde, sans migration.
 *
 * `live` ouvre la liste parce qu'un direct est périssable : ce qui se passe
 * maintenant passe avant ce qui se lit quand on veut.
 */
export const USER_SHOWCASE_SECTION_KEYS = [
  "live",
  "about",
  "decks",
  "publications",
  "achievements",
  "follows",
  "trade",
] as const;

export type UserShowcaseSectionKey = (typeof USER_SHOWCASE_SECTION_KEYS)[number];

export type UserShowcaseSectionState = {
  key: UserShowcaseSectionKey;
  enabled: boolean;
};

export type UserShowcaseSection = {
  key: UserShowcaseSectionKey;
  enabled: boolean;
  /**
   * Souhaits et ventes sont toujours affichés : leur visibilité se règle liste
   * par liste, sur chaque liste. Un second interrupteur ici mentirait sur qui
   * décide.
   */
  locked?: boolean;
};

/** Les blocs qu'un compte ne peut pas éteindre depuis cette liste. */
const LOCKED: UserShowcaseSectionKey[] = ["trade"];

/**
 * Ce que la lecture a besoin de connaître du compte, et rien de plus.
 *
 * Déclaré ici plutôt qu'importé de `lib/types/User` : c'est ce dernier qui
 * dépend de ce module pour le type de ses clés, et se citer mutuellement pour
 * un `Pick` ne rendrait service à personne.
 */
export type UserShowcaseSectionsSource = {
  showcase?: { sections?: UserShowcaseSectionState[] };
};

/**
 * Les blocs de la vitrine, complétés et remis en ordre.
 *
 * Ce que cette lecture garantit : **toutes** les clés connues sont présentes,
 * exactement une fois, les inconnues écartées. Un bloc absent de ce qui est
 * stocké — parce qu'il a été ajouté après le dernier enregistrement du compte —
 * revient activé, à sa place par défaut, plutôt que de disparaître en silence.
 */
export function readUserShowcaseSections(
  user: UserShowcaseSectionsSource,
): UserShowcaseSection[] {
  const stored = user.showcase?.sections ?? [];
  const known = new Map<UserShowcaseSectionKey, boolean>();

  for (const section of stored) {
    if (USER_SHOWCASE_SECTION_KEYS.includes(section.key) && !known.has(section.key)) {
      known.set(section.key, section.enabled);
    }
  }

  const ordered: UserShowcaseSectionKey[] = [...known.keys()];

  for (const key of USER_SHOWCASE_SECTION_KEYS) {
    if (known.has(key)) {
      continue;
    }

    // Le bloc se pose **après** le dernier de ses prédécesseurs déjà placés, et
    // non avant son premier successeur : quelqu'un qui a délibérément mis « À
    // propos » en tête verrait sinon des blocs qu'il n'a jamais ordonnés se
    // glisser au-dessus. Sans prédécesseur placé, il prend la tête ; sans
    // repère du tout, la fin.
    const predecessors = USER_SHOWCASE_SECTION_KEYS.slice(
      0,
      USER_SHOWCASE_SECTION_KEYS.indexOf(key),
    );
    const anchor = predecessors.filter((previous) => ordered.includes(previous)).pop();

    ordered.splice(anchor ? ordered.indexOf(anchor) + 1 : 0, 0, key);
  }

  return ordered.map((key) => ({
    key,
    enabled: LOCKED.includes(key) ? true : (known.get(key) ?? true),
    locked: LOCKED.includes(key) || undefined,
  }));
}
