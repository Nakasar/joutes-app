/**
 * Possession des produits, telle qu'on l'affiche sur une grille de catalogue.
 *
 * Deux questions se posent devant une boîte, et il ne faut surtout pas les
 * confondre :
 *
 *  - **« Ai-je déjà tout ce qu'il y a dedans ? »** — sans se soucier d'où
 *    viennent les figurines. C'est ce qui décide d'un achat, et cela a un sens
 *    même pour une boîte qu'on ne possède pas : inutile de l'acheter, j'ai déjà
 *    tout dedans. C'est `contentCompletion`.
 *  - **« Rien n'est sorti de *cette* boîte-là ? »** — celle que je possède,
 *    dont j'ai peut-être revendu deux figurines. C'est `boxCompletion`, et elle
 *    ne se pose que sur la fiche d'un exemplaire.
 *
 * La complétude se compte en **références**, pas en unités : une boîte de huit
 * figurines dont deux sont des jumelles affiche « 7/7 », parce que c'est le
 * nombre de choses différentes qu'il faut avoir. Compter les unités ferait
 * dépendre l'indicateur du nombre d'exemplaires possédés, ce qu'aucun joueur ne
 * lit ainsi.
 *
 * Module pur, sans accès à la base : on lui passe un relevé de possession.
 */

import type { ProductContent } from "@/lib/types/product";

/** Exemplaires possédés, par identifiant de produit. */
export type ProductCopies = Record<string, number>;

export type ContentCompletion = {
  /** Références du contenu dont on possède au moins la quantité requise. */
  owned: number;
  /** Références distinctes composant le contenu. */
  total: number;
  complete: boolean;
};

export type ProductOwnership = ContentCompletion & {
  /** Exemplaires possédés du produit lui-même. */
  copies: number;
};

function completion(contents: ProductContent[], copies: ProductCopies): ContentCompletion {
  const total = contents.length;
  const owned = contents.filter((line) => (copies[line.productId] ?? 0) >= line.quantity).length;

  // Un produit sans contenu n'est pas « complet » : la question ne se pose pas.
  // Le dire complet allumerait l'indicateur sur toutes les figurines du jeu.
  return { owned, total, complete: total > 0 && owned === total };
}

/**
 * Complétude du contenu d'un produit du catalogue, toutes provenances
 * confondues.
 */
export function contentCompletion(
  contents: ProductContent[] | undefined,
  copies: ProductCopies
): ContentCompletion {
  return completion(contents ?? [], copies);
}

/**
 * Complétude d'un **exemplaire** de conteneur : `brought` ne compte que les
 * exemplaires encore rattachés à cette boîte-là. Une figurine détachée ou
 * supprimée en sort, et c'est précisément ce qu'on veut voir.
 */
export function boxCompletion(
  contents: ProductContent[] | undefined,
  brought: ProductCopies
): ContentCompletion {
  return completion(contents ?? [], brought);
}

/**
 * Relevé complet d'un produit pour l'affichage d'une tuile : ce qu'on possède
 * de lui, et ce qu'on possède de son contenu.
 */
export function productOwnership(
  product: { id: string; contents?: ProductContent[] },
  copies: ProductCopies
): ProductOwnership {
  return {
    copies: copies[product.id] ?? 0,
    ...contentCompletion(product.contents, copies),
  };
}

/**
 * La tuile doit-elle porter la marque « tu as déjà tout le contenu » ?
 *
 * Elle ne s'allume que sur un conteneur **qu'on ne possède pas** : sur une boîte
 * déjà possédée, l'anneau de possession dit l'essentiel et la complétude du
 * contenu se lit sur sa fiche. C'est le seul cas où l'information change une
 * décision.
 */
export function suggestsRedundantPurchase(ownership: ProductOwnership): boolean {
  return ownership.copies === 0 && ownership.complete;
}
