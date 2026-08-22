import type { Game } from "@/lib/types/Game";

/**
 * Zones d'un deck.
 *
 * Un deck ne se range pas pareil selon le jeu : Riftbound sépare la légende,
 * les champions, les runes et les champs de bataille, là où la plupart des
 * autres TCG se contentent d'un deck principal, d'une réserve et d'une zone
 * supplémentaire. Les clés sont communes — c'est ce que porte le document en
 * base — et chaque jeu déclare celles qu'il utilise, avec leur libellé et leur
 * règle de taille.
 *
 * Les clés ne sont pas des libellés : elles sont écrites en base et lues par
 * `parseDeckList` / `stringifyDeckList` du vérificateur de deck. Elles ne
 * changent pas de nom sans migration.
 */
export const DECK_ZONE_KEYS = [
  "legend",
  "champions",
  "maindeck",
  "runes",
  "battlefields",
  "sideboard",
  "extra",
] as const;

export type DeckZoneKey = (typeof DECK_ZONE_KEYS)[number];

export function isDeckZoneKey(key: string): key is DeckZoneKey {
  return (DECK_ZONE_KEYS as readonly string[]).includes(key);
}

/**
 * Contrainte de taille d'une zone.
 *
 * `exact` veut dire « ni plus ni moins » (12 runes), `min` un plancher (40
 * cartes au minimum), `max` un plafond (10 cartes de réserve au plus). Une zone
 * sans contrainte — `none` — ne rend jamais le deck non conforme.
 */
export type DeckZoneBound = "exact" | "min" | "max" | "none";

export type DeckZone = {
  key: DeckZoneKey;
  /** Libellé complet, celui des en-têtes de zone. */
  label: string;
  /** Libellé court, pour les pastilles de zone de la vue mobile. */
  short: string;
  bound: DeckZoneBound;
  /** Nombre visé par la contrainte ; absent quand `bound` vaut `none`. */
  target?: number;
  /** Rappel de la règle, affiché sous l'en-tête de zone. */
  rule: string;
  /** La zone compte dans la courbe de coûts (le deck principal, en pratique). */
  curve?: boolean;
};

/**
 * Zones de Riftbound, telles que les impose le format Standard.
 */
const RIFTBOUND_ZONES: DeckZone[] = [
  { key: "legend", label: "Légende", short: "Légende", bound: "exact", target: 1, rule: "1 exemplaire" },
  { key: "champions", label: "Champions", short: "Champions", bound: "max", target: 3, rule: "1 à 3" },
  { key: "maindeck", label: "Deck principal", short: "Principal", bound: "min", target: 40, rule: "40 minimum", curve: true },
  { key: "runes", label: "Runes", short: "Runes", bound: "exact", target: 12, rule: "12 exactement" },
  { key: "battlefields", label: "Battlefields", short: "Battlefields", bound: "exact", target: 3, rule: "3 exactement" },
  { key: "sideboard", label: "Réserve", short: "Réserve", bound: "max", target: 10, rule: "jusqu'à 10" },
];

/**
 * Zones par défaut, pour tout jeu qui n'en déclare pas de particulières.
 */
const GENERIC_ZONES: DeckZone[] = [
  { key: "maindeck", label: "Deck principal", short: "Principal", bound: "min", target: 60, rule: "60 minimum", curve: true },
  { key: "sideboard", label: "Réserve", short: "Réserve", bound: "max", target: 15, rule: "jusqu'à 15" },
  { key: "extra", label: "Zone extra", short: "Extra", bound: "max", target: 15, rule: "zone facultative du jeu" },
];

/**
 * Zones du jeu passé en paramètre.
 *
 * Le découpage suit le jeu, pas le deck : deux decks du même jeu se rangent de
 * la même façon, et un deck qui porte des cartes dans une zone que son jeu
 * n'expose pas les garde en base — elles réapparaîtront si le jeu la déclare à
 * nouveau — mais ne les montre pas.
 */
export function getDeckZones(game?: Pick<Game, "slug"> | null): DeckZone[] {
  if (game?.slug === "riftbound") {
    return RIFTBOUND_ZONES;
  }

  return GENERIC_ZONES;
}

/** La zone visée par défaut à l'ouverture de l'éditeur : celle où va le gros du deck. */
export function defaultDeckZone(zones: DeckZone[]): DeckZoneKey {
  return zones.find((zone) => zone.curve)?.key ?? zones[0]?.key ?? "maindeck";
}

export function findDeckZone(zones: DeckZone[], key: string): DeckZone | undefined {
  return zones.find((zone) => zone.key === key);
}

/**
 * La zone est-elle dans les clous ?
 *
 * Une zone vide sans contrainte de plancher est conforme : un deck sans réserve
 * n'est pas un deck illégal.
 */
export function isZoneCompliant(zone: DeckZone, count: number): boolean {
  if (zone.bound === "none" || zone.target === undefined) {
    return true;
  }

  switch (zone.bound) {
    case "exact":
      return count === zone.target;
    case "min":
      return count >= zone.target;
    case "max":
      return count <= zone.target;
  }
}

/**
 * Compteur affiché dans l'en-tête d'une zone : « 12 / 12 » quand il y a une
 * cible à atteindre ou à ne pas dépasser, le seul nombre sinon — un plancher se
 * lit mal en fraction, un deck de 58 cartes sur 40 n'est pas « 58 / 40 ».
 */
export function zoneCounterLabel(zone: DeckZone, count: number): string {
  if (zone.target !== undefined && (zone.bound === "exact" || zone.bound === "max")) {
    return `${count} / ${zone.target}`;
  }

  return String(count);
}
