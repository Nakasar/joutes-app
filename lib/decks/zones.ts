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
 * Une zone telle qu'elle est **réglée** : deux bornes, et rien d'autre.
 *
 * `min` est un plancher, `max` un plafond ; les deux ensemble encadrent, égales
 * elles imposent un compte exact (12 runes), absentes toutes deux elles ne
 * contraignent rien. C'est cette forme qui est écrite sur le jeu et saisie dans
 * l'administration.
 *
 * Elle remplace un couple `bound` / `target` qui ne savait dire qu'une borne à
 * la fois : « 1 à 3 champions » s'y écrivait `max: 3` en laissant le plancher à
 * la phrase de règle, que personne ne vérifiait.
 */
export type DeckZoneBounds = {
  key: DeckZoneKey;
  /** Libellé complet, celui des en-têtes de zone. */
  label: string;
  /** Libellé court, pour les pastilles de zone de la vue mobile. */
  short: string;
  min?: number;
  max?: number;
  /** La zone compte dans la courbe de coûts (le deck principal, en pratique). */
  curve?: boolean;
};

/**
 * Les réglages du deck builder d'un jeu, tels qu'ils vivent sur le document.
 *
 * Absent, le jeu suit les tables livrées avec la plateforme — c'est le cas de
 * tous les jeux tant que personne n'a ouvert l'onglet « Deck builder » de leur
 * fiche d'administration.
 */
export type GameDeckBuilder = {
  zones: DeckZoneBounds[];
  /** Plafond d'exemplaires d'une même carte, toutes zones confondues. */
  maxCopies?: number;
  /** Bornes de la somme des zones. */
  totalMin?: number;
  totalMax?: number;
  /**
   * Types ou mots-clés dont les cartes échappent au plafond d'exemplaires —
   * « Rune », « Terrain de base ». Comparés au `type` de la carte, sans casse.
   */
  unlimitedTypes?: string[];
};

/** Une zone prête à l'affichage : ses bornes, plus la phrase qui les dit. */
export type DeckZone = DeckZoneBounds & {
  /** Rappel de la règle, affiché sous l'en-tête de zone. Dérivé des bornes. */
  rule: string;
};

/**
 * La phrase de règle d'une zone, dérivée de ses bornes.
 *
 * Dérivée et non saisie : une troisième valeur à tenir à jour à la main aurait
 * fini par mentir sur les deux autres, et c'est exactement ce qu'elle faisait —
 * « 1 à 3 » sous une zone qui n'imposait que le plafond.
 */
export function deckZoneRule(zone: Pick<DeckZoneBounds, "min" | "max">): string {
  const { min, max } = zone;

  if (min !== undefined && max !== undefined) {
    return min === max ? `${min} exactement` : `${min} à ${max}`;
  }
  if (min !== undefined) {
    return `${min} minimum`;
  }
  if (max !== undefined) {
    return `jusqu'à ${max}`;
  }

  return "aucune contrainte";
}

function toDeckZone(zone: DeckZoneBounds): DeckZone {
  return { ...zone, rule: deckZoneRule(zone) };
}

/**
 * Zones de Riftbound, telles que les impose le format Standard.
 */
const RIFTBOUND_ZONES: DeckZoneBounds[] = [
  { key: "legend", label: "Légende", short: "Légende", min: 1, max: 1 },
  { key: "champions", label: "Champions", short: "Champions", min: 1, max: 3 },
  { key: "maindeck", label: "Deck principal", short: "Principal", min: 40, curve: true },
  { key: "runes", label: "Runes", short: "Runes", min: 12, max: 12 },
  { key: "battlefields", label: "Battlefields", short: "Battlefields", min: 3, max: 3 },
  { key: "sideboard", label: "Réserve", short: "Réserve", max: 10 },
];

/**
 * Zones par défaut, pour tout jeu qui n'en déclare pas de particulières.
 */
const GENERIC_ZONES: DeckZoneBounds[] = [
  { key: "maindeck", label: "Deck principal", short: "Principal", min: 60, curve: true },
  { key: "sideboard", label: "Réserve", short: "Réserve", max: 15 },
  { key: "extra", label: "Zone extra", short: "Extra", max: 15 },
];

/**
 * Les zones livrées pour un jeu, avant tout réglage — ce que l'administration
 * propose de reprendre quand elle ouvre un deck builder encore vierge.
 */
export function shippedDeckZones(slug?: string | null): DeckZoneBounds[] {
  return slug === "riftbound" ? RIFTBOUND_ZONES : GENERIC_ZONES;
}

/**
 * Zones du jeu passé en paramètre.
 *
 * Le découpage suit le jeu, pas le deck : deux decks du même jeu se rangent de
 * la même façon, et un deck qui porte des cartes dans une zone que son jeu
 * n'expose pas les garde en base — elles réapparaîtront si le jeu la déclare à
 * nouveau — mais ne les montre pas.
 *
 * Un jeu réglé depuis l'administration passe devant les tables livrées ; une
 * liste de zones vide n'est pas un réglage mais l'absence de réglage, et
 * retombe donc sur elles plutôt que de rendre le deck builder inutilisable.
 *
 * Le paramètre est structurel plutôt qu'un `Pick<Game, …>` : `Game` importe
 * déjà ce module pour `GameDeckBuilder`, et le typer par lui refermerait le
 * cycle.
 */
export function getDeckZones(
  game?: { slug?: string; deckBuilder?: GameDeckBuilder } | null
): DeckZone[] {
  const configured = game?.deckBuilder?.zones;

  if (configured && configured.length > 0) {
    return configured.map(toDeckZone);
  }

  return shippedDeckZones(game?.slug).map(toDeckZone);
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
export function isZoneCompliant(zone: DeckZoneBounds, count: number): boolean {
  if (zone.min !== undefined && count < zone.min) {
    return false;
  }
  if (zone.max !== undefined && count > zone.max) {
    return false;
  }

  return true;
}

/**
 * Compteur affiché dans l'en-tête d'une zone : « 12 / 12 » quand il y a une
 * cible à atteindre ou à ne pas dépasser, le seul nombre sinon — un plancher se
 * lit mal en fraction, un deck de 58 cartes sur 40 n'est pas « 58 / 40 ».
 */
export function zoneCounterLabel(zone: DeckZoneBounds, count: number): string {
  if (zone.max !== undefined) {
    return `${count} / ${zone.max}`;
  }

  return String(count);
}
