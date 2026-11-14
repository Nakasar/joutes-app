/**
 * La table filmée : ce que la lecture de l'image et le suivi du moteur
 * échangent avec la page. Les formes sont celles de `joutes-engine`
 * (`joutes-vision`, `joutes-track`, voir son `docs/suivi.md`).
 */

export type Point = [number, number];

/** Une carte trouvée dans l'image. */
export type Found = {
  /** Le code moteur de la carte ; ce qui suit un `#` distingue deux illustrations. */
  id: string;
  /** Le nombre de points concordants : la confiance. */
  points: number;
  /** Ses quatre coins dans l'image. */
  quad: Point[];
  /** L'angle dont elle est tournée, en radians. */
  angle: number;
  /** Son centre. */
  at: Point;
  /** Le nombre de lectures qui l'ont trouvée au même endroit. */
  seen: number;
  /** Assez de points, ou assez de lectures concordantes, pour la tenir pour vraie. */
  sure: boolean;
};

/** Ce que la lecture répond à chaque image. */
export type Glance = { state: "moving" | "still" | "read"; areas: [number, number, number, number][]; found: Found[] };

export type AreaKind = "base" | "battlefield" | "trash";

/** Une zone de la table, tracée au calibrage : `x, y, largeur, hauteur` dans l'image. */
export type Area = { kind: AreaKind; index: number; rect: [number, number, number, number] };

export type Layout = {
  areas: Area[];
  /** Les joueurs sont assis à gauche et à droite de l'image. */
  sideways: boolean;
  /** Les cartes face cachée, comptées par l'opérateur : par champ de bataille puis par siège. */
  facedown: number[][];
};

export type Seen = { card: string; exhausted?: boolean };

export type Observation = {
  players: { base: Seen[]; chain: string[]; trash_top: string | null }[];
  battlefields: { units: Seen[][]; facedown: number[] }[];
};

export type Step = { seat: number; player: string; chose: string };

/** Une suite d'actions permises et son récit, la règle citée entre parenthèses. */
export type Explanation = { steps: Step[]; lines: string[]; rules: string[] };

export type DeviationKind = "decklist" | "cost" | "unplayable" | "unexplained";

export type Deviation = {
  kind: DeviationKind;
  title: string;
  seen: string[];
  reason: string | null;
  rule: string | null;
  nearest: Explanation;
};

export type Outcome =
  | { outcome: "unchanged" }
  | ({ outcome: "explained" } & Explanation)
  | { outcome: "ambiguous"; options: Explanation[] }
  | ({ outcome: "deviation" } & Deviation);

/** Ce que l'opérateur a dit d'une carte mal lue : sa vraie identité, ou `null` si ce n'est pas une carte. */
export type Override = { at: Point; card: string | null };

/** Une image de référence à apprendre : l'identifiant de la lecture et l'adresse de l'image. */
export type ReferenceCard = { id: string; url: string };
