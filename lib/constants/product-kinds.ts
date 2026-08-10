/**
 * Types de produits d'un jeu de figurines. Contrairement aux cartes, dont le
 * catalogue est plat, une gamme se vend sous des formes très différentes :
 * boîte d'armée, blister d'une figurine, coffret de démarrage, accessoire.
 *
 * Le type ne pilote **aucun comportement** : ce qui fait d'un produit un
 * conteneur, c'est son contenu (`contents`), rien d'autre. Sans quoi une boîte
 * dont le contenu n'a pas encore été saisi se comporterait comme un conteneur
 * vide, et un blister de trois figurines comme une figurine seule. Le type
 * n'est qu'une facette d'affichage et de filtre.
 */
export const PRODUCT_KINDS = {
  box: "Boîte",
  unit: "Figurine",
  starter: "Coffret de démarrage",
  bundle: "Lot",
  accessory: "Accessoire",
  book: "Livre",
  other: "Autre",
} as const;

export type ProductKindKey = keyof typeof PRODUCT_KINDS;

export const PRODUCT_KIND_KEYS = Object.keys(PRODUCT_KINDS) as ProductKindKey[];

export const PRODUCT_KIND_OPTIONS = Object.entries(PRODUCT_KINDS).map(([value, label]) => ({
  value: value as ProductKindKey,
  label,
}));

export function isProductKind(value: string): value is ProductKindKey {
  return Object.hasOwn(PRODUCT_KINDS, value);
}
