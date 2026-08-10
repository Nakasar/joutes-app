import { ObjectId } from "bson";
import type { Game } from "@/lib/types/Game";
import type { ProductKindKey } from "@/lib/constants/product-kinds";
import type { PaintStateKey } from "@/lib/constants/paint-states";
import type { CollectionCurrency } from "@/lib/schemas/collection.schema";

/** Valeur d'un attribut de produit : mêmes formes que pour une carte. */
export type ProductAttributeValue = string | number | boolean | string[];

/**
 * Un produit contenu dans un autre, référencé par son `id` au sein du même jeu.
 * Une boîte qui contient trois fois la même figurine porte une seule ligne, de
 * quantité 3.
 */
export type ProductContent = {
  productId: string;
  quantity: number;
};

/**
 * Produit du catalogue d'un jeu : une boîte, un blister, un accessoire.
 *
 * Un produit sans `contents` est une **feuille** — typiquement une figurine.
 * C'est le contenu, et lui seul, qui fait d'un produit un conteneur : `kind`
 * n'est qu'une facette d'affichage (voir `lib/constants/product-kinds.ts`).
 *
 * Un conteneur ne peut pas en contenir un autre : la règle est vérifiée à
 * l'enregistrement par `lib/products/contents.ts`, et tout le reste du code en
 * dépend (l'ajout à la collection est un `insertMany` plat, l'affichage du
 * contenu n'a pas de déroulé).
 */
export type Product = {
  /** Stable, unique **par jeu**, figé après création. */
  id: string;
  gameId: Game["id"];
  name: string;
  kind: ProductKindKey;
  image?: string;
  /** Gamme, vague ou extension — l'équivalent du `setCode` d'une carte. */
  setCode?: string;
  contents: ProductContent[];
  attributes: Record<string, ProductAttributeValue>;
};

export type ProductDb = {
  gameId: ObjectId;
  id: string;
  name: string;
  kind: ProductKindKey;
  image?: string;
  setCode?: string;
  contents?: ProductContent[];
  attributes?: Record<string, ProductAttributeValue>;
  source?: "manual" | "import";
  createdBy?: string;
  createdAt?: Date;
  manuallyEditedAt?: Date;
  manuallyEditedBy?: string;
};

/**
 * Exemplaire possédé, **un document par exemplaire physique** — comme
 * `collection-cards`, dont ce modèle reprend les conventions (propriétaire
 * `userId` **ou** `playGroupId`, jamais les deux ; champs dénormalisés à
 * l'écriture pour survivre à la disparition du produit du catalogue).
 *
 * Deux différences assumées avec `collection-cards` :
 *
 *  - `gameId` est écrit ici plutôt que retrouvé par jointure. Sans lui, un jeu
 *    sans cartes resterait invisible dans la vue d'ensemble de la collection.
 *  - `fromProductEntryId` désigne un **exemplaire** de boîte, pas un produit du
 *    catalogue : deux boîtes identiques restent deux objets distincts, et chaque
 *    figurine sait de laquelle elle est sortie.
 */
export type CollectionProductDb = {
  userId?: ObjectId;
  playGroupId?: ObjectId;
  addedByUserId?: ObjectId;
  gameId: ObjectId;
  productId: string;
  name: string;
  image?: string;
  kind: ProductKindKey;
  setCode?: string;
  paintState?: PaintStateKey;
  /** Écrit seulement lorsqu'il vaut `true`, comme le `foil` d'une carte. */
  sealed?: boolean;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CollectionCurrency;
  note?: string;
  borrowedBy?: string;
  fromProductEntryId?: ObjectId;
  createdAt: Date;
};

/** Exemplaire tel qu'il est renvoyé au client. */
export type CollectionProductEntry = {
  id: string;
  productId: string;
  name: string;
  image?: string;
  kind: ProductKindKey;
  setCode?: string;
  paintState?: PaintStateKey;
  sealed?: boolean;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CollectionCurrency;
  note?: string;
  borrowedBy?: string;
  /** Exemplaire de conteneur qui a apporté celui-ci, s'il n'a pas été détaché. */
  fromProductEntryId?: string;
  createdAt: string;
};
