import { slugSegment } from "@/lib/constants/card-ids";

/**
 * Identifiant d'un produit, dérivé de sa gamme et de son nom
 * (« Spearhead: Stormstrike » dans la gamme `AOS4` -> `AOS4-spearhead-stormstrike`).
 *
 * Contrairement à une carte, un produit n'a pas de numéro de collection : son
 * nom est ce qui le distingue. La gamme est mise en tête pour qu'un même nom
 * réutilisé d'une vague à l'autre reste distinguable, et parce que l'identifiant
 * se lit alors comme une référence de catalogue.
 *
 * L'identifiant reste modifiable à la main à la création, puis **figé** : il est
 * référencé à la fois par les exemplaires en collection et par le contenu des
 * autres produits.
 */
export function buildProductId(setCode: string | undefined, name: string): string {
  const slug = slugSegment(name);
  if (!slug) {
    return "";
  }

  const set = setCode?.trim().toUpperCase();
  return set ? `${set}-${slug}` : slug;
}
