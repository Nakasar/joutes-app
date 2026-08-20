import type { Lair } from "@/lib/types/Lair";

/**
 * Les sections de la vitrine, dans leur ordre par défaut.
 *
 * L'ordre stocké est une liste de clés : un lieu qui n'a rien réordonné n'a
 * rien en base, et suit celui-ci. Ajouter une section plus tard la place donc
 * à sa position par défaut chez tout le monde, sans migration.
 */
export const LAIR_SECTION_KEYS = ["news", "featured", "calendar", "media", "about"] as const;

export type LairSectionKey = (typeof LAIR_SECTION_KEYS)[number];

export type LairSection = {
  key: LairSectionKey;
  enabled: boolean;
  /** Le calendrier est toujours affiché : c'est ce qu'on vient chercher ici. */
  locked?: boolean;
};

/** Les sections qu'un lieu ne peut pas éteindre. */
const LOCKED: LairSectionKey[] = ["calendar"];

/**
 * Les sections du lieu, complétées et remises en ordre.
 *
 * Ce que cette lecture garantit à l'appelant : **toutes** les clés connues sont
 * présentes, exactement une fois, les inconnues écartées. Une section absente
 * de ce qui est stocké — parce qu'elle a été ajoutée après la dernière
 * sauvegarde du lieu — revient donc activée, à sa place par défaut, plutôt que
 * de disparaître silencieusement de la page.
 */
export function readLairSections(lair: Pick<Lair, "options">): LairSection[] {
  const stored = lair.options?.sections ?? [];
  const known = new Map<LairSectionKey, boolean>();

  for (const section of stored) {
    if (LAIR_SECTION_KEYS.includes(section.key) && !known.has(section.key)) {
      known.set(section.key, section.enabled);
    }
  }

  // Les clés manquantes reprennent leur place par défaut plutôt que la fin :
  // une section ajoutée après la dernière sauvegarde d'un lieu doit apparaître
  // là où elle a été pensée, non reléguée en bas de page chez tous les lieux
  // qui avaient déjà réordonné.
  const ordered: LairSectionKey[] = [...known.keys()];

  for (const key of LAIR_SECTION_KEYS) {
    if (known.has(key)) {
      continue;
    }

    // La section se pose **après** le dernier de ses prédécesseurs déjà placés,
    // et non avant son premier successeur : un lieu qui a délibérément mis
    // « À propos » en tête verrait sinon trois sections qu'il n'a jamais
    // ordonnées se glisser au-dessus. Sans prédécesseur placé, elle prend la
    // tête ; sans repère du tout, la fin.
    const predecessors = LAIR_SECTION_KEYS.slice(0, LAIR_SECTION_KEYS.indexOf(key));
    const anchor = predecessors.filter((previous) => ordered.includes(previous)).pop();

    ordered.splice(anchor ? ordered.indexOf(anchor) + 1 : 0, 0, key);
  }

  return ordered.map((key) => ({
    key,
    enabled: LOCKED.includes(key) ? true : (known.get(key) ?? true),
    locked: LOCKED.includes(key) || undefined,
  }));
}

/** Une section est-elle affichée sur la vitrine ? */
export function isSectionEnabled(sections: LairSection[], key: LairSectionKey): boolean {
  return sections.find((section) => section.key === key)?.enabled ?? true;
}
