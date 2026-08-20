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

  const ordered: LairSectionKey[] = [
    ...[...known.keys()],
    ...LAIR_SECTION_KEYS.filter((key) => !known.has(key)),
  ];

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
