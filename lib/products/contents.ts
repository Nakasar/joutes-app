/**
 * Contenu d'un produit : normalisation et règles de composition.
 *
 * Une seule règle structure tout le reste : **un produit qui a un contenu ne
 * peut pas figurer dans le contenu d'un autre**. Dans la vraie vie, une boîte
 * d'armée contient des figurines, pas des boîtes ; s'en tenir à un niveau rend
 * l'ajout à la collection plat (un `insertMany`), le retrait unitaire (un
 * `deleteMany`) et l'affichage du contenu sans déroulé.
 *
 * Module pur : il ne lit pas la base, on lui donne ce qu'il doit savoir des
 * produits référencés. C'est ce qui le rend testable.
 */

import type { ProductContent } from "@/lib/types/product";

/** Ce qu'il faut savoir d'un produit référencé pour juger d'une composition. */
export type ReferencedProduct = {
  id: string;
  name: string;
  /** Le produit est lui-même un conteneur. */
  hasContents: boolean;
};

export type ContentIssue =
  | { code: "self-reference" }
  | { code: "unknown"; productId: string }
  | { code: "nested-container"; productId: string; name: string };

export type ContentValidation = {
  /** Contenu normalisé : doublons fusionnés, ordre de première apparition conservé. */
  contents: ProductContent[];
  issues: ContentIssue[];
};

/**
 * Fusionne les doublons en additionnant leurs quantités, plafonnées comme à la
 * saisie. Coller deux fois la même référence est une maladresse courante, pas
 * une erreur : on la corrige plutôt que de refuser la liste entière.
 */
export function normalizeContents(contents: ProductContent[]): ProductContent[] {
  const merged = new Map<string, number>();

  for (const line of contents) {
    const productId = line.productId.trim();
    if (!productId) continue;
    const quantity = Math.max(1, Math.trunc(line.quantity));
    merged.set(productId, Math.min(99, (merged.get(productId) ?? 0) + quantity));
  }

  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Vérifie qu'une composition est tenable. `referenced` ne contient que les
 * produits du **même jeu** : un identifiant absent est donc soit inexistant,
 * soit celui d'un autre jeu, et les deux cas se rapportent de la même façon.
 */
export function validateContents(
  productId: string,
  contents: ProductContent[],
  referenced: ReferencedProduct[]
): ContentValidation {
  const normalized = normalizeContents(contents);
  const byId = new Map(referenced.map((product) => [product.id, product]));
  const issues: ContentIssue[] = [];

  for (const line of normalized) {
    if (line.productId === productId) {
      issues.push({ code: "self-reference" });
      continue;
    }

    const product = byId.get(line.productId);
    if (!product) {
      issues.push({ code: "unknown", productId: line.productId });
      continue;
    }

    if (product.hasContents) {
      issues.push({ code: "nested-container", productId: product.id, name: product.name });
    }
  }

  return { contents: normalized, issues };
}

/** Le produit est-il un conteneur ? Son contenu en décide, jamais son type. */
export function isContainer(product: { contents?: ProductContent[] }): boolean {
  return (product.contents?.length ?? 0) > 0;
}

/**
 * Déplie le contenu en une liste d'unités : une boîte portant « 3 × Liberator »
 * donne trois fois `"liberator"`. C'est ce que l'ajout à la collection insère,
 * un document par exemplaire physique — comme pour les cartes.
 */
export function flattenContents(contents: ProductContent[]): string[] {
  return contents.flatMap((line) => Array.from({ length: line.quantity }, () => line.productId));
}

/**
 * Rend un message lisible pour chaque anomalie. L'administration colle des
 * listes entières : nommer le fautif est ce qui distingue un compte rendu utile
 * d'un « données invalides ».
 */
export function describeContentIssue(issue: ContentIssue): string {
  switch (issue.code) {
    case "self-reference":
      return "Un produit ne peut pas se contenir lui-même.";
    case "unknown":
      return `Aucun produit « ${issue.productId} » dans ce jeu.`;
    case "nested-container":
      return `« ${issue.name} » contient déjà d'autres produits : un contenant ne peut pas en contenir un autre.`;
  }
}
