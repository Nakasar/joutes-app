/**
 * Variante d'impression d'une carte : une même carte (même numéro de
 * collection) existe souvent en plusieurs tirages — normal, foil, promo pack,
 * pre-release, judge… Chaque variante peut avoir sa propre illustration ;
 * faute d'image, celle de la carte de base est utilisée.
 */
export type CardPrinting = {
  /** Identifiant stable au sein de la carte, dérivé du nom de la variante. */
  id: string;
  name: string;
  /** La variante est imprimée en foil. */
  foil?: boolean;
  image?: string;
};

/**
 * Sens d'impression d'une carte. La quasi-totalité des cartes se lisent à la
 * verticale ; certaines — les champs de bataille de Riftbound — sont imprimées
 * dans le sens de la largeur. Une carte qui ne dit rien est en `portrait`.
 */
export type CardOrientation = "portrait" | "landscape";

/** Seule lecture à faire du champ : tout ce qui n'est pas `landscape` se lit à la verticale. */
export function isLandscapeCard(orientation?: string): boolean {
  return orientation === "landscape";
}

/**
 * Propriétés de carte dépendantes du jeu : chaque jeu n'en renseigne qu'un
 * sous-ensemble (Riftbound remplit domain / energy / might…, d'autres jeux
 * n'exposeront que `type`). Toutes sont donc optionnelles.
 */
export type CardAttributes = {
  type?: string;
  superType?: string;
  tags?: string[];
  types?: string[];
  energy?: number;
  power?: number;
  might?: number;
  rarity?: string;
  domain?: string[];
  illustrator?: string[];
  orientation?: CardOrientation;
};

export const CARD_ATTRIBUTE_KEYS = [
  "type",
  "superType",
  "tags",
  "types",
  "energy",
  "power",
  "might",
  "rarity",
  "domain",
  "illustrator",
  "orientation",
] as const satisfies readonly (keyof CardAttributes)[];
