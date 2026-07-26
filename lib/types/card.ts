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
] as const satisfies readonly (keyof CardAttributes)[];
