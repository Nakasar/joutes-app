import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { CardAttributeFieldType } from "@/lib/db/cards";
import type { ProductKindKey } from "@/lib/constants/product-kinds";
import type { Product, ProductAttributeValue, ProductContent, ProductDb } from "@/lib/types/product";
import { normalizeContents, type ReferencedProduct } from "@/lib/products/contents";
import type { ProductFacet } from "@/lib/products/search";
import { PRODUCT_EDITION_ATTRIBUTE, PRODUCT_EDITION_FIELD } from "@/lib/constants/product-editions";

const COLLECTION = "products";

export type ProductAttributeField = {
  key: string;
  type: CardAttributeFieldType;
  /** Valeurs déjà utilisées, proposées en autocomplétion quand elles sont peu nombreuses. */
  suggestions?: string[];
};

/** `$type` Mongo -> type de champ du formulaire, le plus permissif l'emportant. */
function attributeFieldType(mongoTypes: string[]): CardAttributeFieldType | null {
  const types = mongoTypes.filter((type) => type !== "null" && type !== "missing");
  if (types.length === 0 || types.every((type) => type === "object")) {
    return null;
  }
  if (types.includes("array")) return "list";
  if (types.every((type) => type === "bool")) return "boolean";
  if (types.every((type) => ["int", "long", "double", "decimal"].includes(type))) return "number";
  return "string";
}

/**
 * Attributs réellement portés par les produits d'un jeu (faction, taille de
 * socle, points…). Comme pour les cartes, rien ne les décrit en base : on les
 * déduit d'un échantillon plutôt que de figer une liste par jeu dans le code.
 *
 * Un point est plus simple ici que pour les cartes : les attributs d'un produit
 * vivent sous `attributes`, et non à la racine du document. Nul besoin d'écarter
 * une liste de champs réservés — la sous-arborescence ne contient qu'eux.
 */
export async function getGameProductAttributeFields(
  gameId: ObjectId,
  sampleSize = 500
): Promise<ProductAttributeField[]> {
  const rows = await db
    .collection(COLLECTION)
    .aggregate<{ _id: string; types: string[]; count: number; values: unknown[] }>([
      { $match: { gameId } },
      { $limit: sampleSize },
      { $project: { fields: { $objectToArray: { $ifNull: ["$attributes", {}] } } } },
      { $unwind: "$fields" },
      {
        $group: {
          _id: "$fields.k",
          types: { $addToSet: { $type: "$fields.v" } },
          count: { $sum: 1 },
          values: { $addToSet: "$fields.v" },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();

  return rows.flatMap((row) => {
    const type = attributeFieldType(row.types);
    if (!type) {
      return [];
    }

    const suggestions = [
      ...new Set(
        row.values
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 40)
      ),
    ].sort();

    return [{
      key: row._id,
      type,
      // Au-delà, il ne s'agit plus d'une liste de valeurs possibles et
      // l'autocomplétion n'aiderait pas.
      suggestions: suggestions.length > 0 && suggestions.length <= 40 ? suggestions : undefined,
    }];
  });
}

/**
 * Au-delà, une liste de valeurs n'est plus un filtre mais un annuaire : la
 * colonne de gauche deviendrait illisible, et l'attribut est de toute façon
 * cherché à la main dans la barre de recherche.
 */
const MAX_FACET_VALUES = 40;

/**
 * Facettes de filtrage d'un catalogue de produits : plages pour les attributs
 * numériques (points, socle…), listes de valeurs pour les autres (faction,
 * unité…).
 *
 * Même principe que pour les cartes — rien n'est déclaré par jeu, tout est
 * relevé sur les produits — mais la source diffère : les cartes lisent les
 * facettes de leur index Meilisearch, le catalogue de produits n'en a pas et
 * les compte donc en base.
 *
 * Trois familles restent dehors, faute d'un contrôle qui les servirait :
 *
 *  - l'**édition**, qui a son propre sélecteur, et qui décide en plus du
 *    périmètre des statistiques ;
 *  - les **booléens**, qu'une pastille à cocher rendrait ambigus (« non coché »
 *    voudrait dire « faux » ou « peu importe » ?) ;
 *  - les attributs à trop de valeurs distinctes, et ceux qui n'en ont qu'une :
 *    un filtre qui ne retire jamais rien n'est pas un filtre.
 */
export async function getGameProductFacets(gameId: ObjectId): Promise<ProductFacet[]> {
  const rows = await db
    .collection(COLLECTION)
    .aggregate<{
      _id: string;
      types: string[];
      values: unknown[];
      min: unknown;
      max: unknown;
      count: number;
    }>([
      { $match: { gameId } },
      { $project: { fields: { $objectToArray: { $ifNull: ["$attributes", {}] } } } },
      { $unwind: "$fields" },
      // Un attribut à valeurs multiples est relevé valeur par valeur : une liste
      // de factions doit peupler le filtre, pas y entrer comme un bloc.
      { $unwind: { path: "$fields.v", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$fields.k",
          types: { $addToSet: { $type: "$fields.v" } },
          values: { $addToSet: "$fields.v" },
          min: { $min: "$fields.v" },
          max: { $max: "$fields.v" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();

  return rows.flatMap((row): ProductFacet[] => {
    if (row._id === PRODUCT_EDITION_ATTRIBUTE) {
      return [];
    }

    const types = row.types.filter((type) => type !== "null" && type !== "missing");
    if (types.length === 0) {
      return [];
    }

    if (types.every((type) => ["int", "long", "double", "decimal"].includes(type))) {
      const min = Number(row.min);
      const max = Number(row.max);
      // Une plage sans étendue ne filtre rien : tous les produits portent la
      // même valeur, et les deux bornes du formulaire seraient identiques.
      return Number.isFinite(min) && Number.isFinite(max) && min < max
        ? [{ key: row._id, type: "number", min, max }]
        : [];
    }

    const values = [
      ...new Set(row.values.filter((value): value is string => typeof value === "string" && value.length > 0)),
    ].sort((a, b) => a.localeCompare(b));

    return values.length > 1 && values.length <= MAX_FACET_VALUES
      ? [{ key: row._id, type: "value", values }]
      : [];
  });
}

export type GameProductSummary = {
  id: string;
  name: string;
  kind: ProductKindKey;
  setCode?: string;
  image?: string;
  /** Nombre de références composant le produit ; 0 = produit feuille. */
  contentsCount: number;
  manuallyEditedAt?: string;
};

export type GameProductDetail = Omit<GameProductSummary, "contentsCount"> & {
  contents: ProductContent[];
  attributes: Record<string, ProductAttributeValue>;
};

const SUMMARY_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  kind: 1,
  setCode: 1,
  image: 1,
  contents: 1,
  manuallyEditedAt: 1,
} as const;

type SummaryDoc = {
  id: string;
  name: string;
  kind: ProductKindKey;
  setCode?: string;
  image?: string;
  contents?: ProductContent[];
  manuallyEditedAt?: Date;
};

function toSummary(doc: SummaryDoc): GameProductSummary {
  return {
    id: doc.id,
    name: doc.name,
    kind: doc.kind,
    setCode: doc.setCode,
    image: doc.image,
    contentsCount: doc.contents?.length ?? 0,
    manuallyEditedAt: doc.manuallyEditedAt?.toISOString(),
  };
}

/** Un produit est identifié par son `id` au sein d'un jeu. */
export async function productIdExists(gameId: ObjectId, id: string): Promise<boolean> {
  const product = await db.collection(COLLECTION).findOne({ gameId, id }, { projection: { _id: 1 } });
  return product !== null;
}

/** Les champs vides ne sont pas écrits : le pilote Mongo les stockerait en `null`. */
function definedEntries(core: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(core).filter(([, value]) => value !== undefined));
}

export type NewProduct = {
  id: string;
  name: string;
  kind: ProductKindKey;
  image?: string;
  setCode?: string;
  contents?: ProductContent[];
  attributes?: Record<string, ProductAttributeValue>;
};

export async function createProduct(gameId: ObjectId, product: NewProduct, createdBy: string): Promise<void> {
  const { attributes, contents, ...core } = product;

  await db.collection(COLLECTION).insertOne({
    ...definedEntries(core),
    gameId,
    ...(contents && contents.length > 0 ? { contents: normalizeContents(contents) } : {}),
    ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
    source: "manual",
    createdBy,
    createdAt: new Date(),
  });
}

/**
 * Modification d'un produit. L'identifiant n'en fait jamais partie : il est
 * référencé par les exemplaires en collection **et** par le contenu des autres
 * produits, le renommer demanderait une cascade sur deux collections. Le
 * formulaire le verrouille en édition, et cette fonction ne le lit pas.
 */
export async function updateProduct(
  gameId: ObjectId,
  id: string,
  product: Omit<NewProduct, "id">,
  editedBy: string
): Promise<void> {
  const { attributes, contents, ...core } = product;

  // Un champ vidé est retiré du document plutôt que stocké en `null`, comme
  // pour les cartes.
  const cleared = Object.entries(core)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);

  const normalized = contents ? normalizeContents(contents) : [];
  if (normalized.length === 0) cleared.push("contents");
  if (!attributes || Object.keys(attributes).length === 0) cleared.push("attributes");

  await db.collection(COLLECTION).updateOne(
    { gameId, id },
    {
      $set: {
        ...definedEntries(core),
        ...(normalized.length > 0 ? { contents: normalized } : {}),
        ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
        manuallyEditedAt: new Date(),
        manuallyEditedBy: editedBy,
      },
      ...(cleared.length > 0 ? { $unset: Object.fromEntries(cleared.map((key) => [key, ""])) } : {}),
    }
  );
}

/**
 * Suppression d'un produit. Elle est refusée tant qu'il est référencé — par une
 * collection ou par le contenu d'un autre produit : effacer le catalogue sous
 * les pieds des utilisateurs laisserait des exemplaires sans nom et des boîtes
 * au contenu fantôme.
 */
export type DeleteProductRefusal = { reason: "owned"; count: number } | { reason: "referenced"; names: string[] };

export async function deleteProduct(
  gameId: ObjectId,
  id: string
): Promise<{ deleted: true } | { deleted: false; refusal: DeleteProductRefusal }> {
  const owned = await db.collection("collection-products").countDocuments({ gameId, productId: id }, { limit: 1 });
  if (owned > 0) {
    const count = await db.collection("collection-products").countDocuments({ gameId, productId: id });
    return { deleted: false, refusal: { reason: "owned", count } };
  }

  const containers = await getContainersReferencing(gameId, id);
  if (containers.length > 0) {
    return { deleted: false, refusal: { reason: "referenced", names: containers.map((product) => product.name) } };
  }

  await db.collection(COLLECTION).deleteOne({ gameId, id });
  return { deleted: true };
}

/** Derniers produits ajoutés à un jeu (ordre d'insertion), pour l'administration. */
export async function getRecentGameProducts(gameId: ObjectId, limit = 10): Promise<GameProductSummary[]> {
  const docs = await db
    .collection<SummaryDoc & { gameId: ObjectId }>(COLLECTION)
    .find({ gameId }, { projection: SUMMARY_PROJECTION })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toSummary);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Recherche d'un produit à modifier ou à ajouter à un contenu : par identifiant ou par nom. */
export async function searchGameProducts(
  gameId: ObjectId,
  query: string,
  {
    limit = 20,
    leavesOnly = false,
    kinds,
  }: { limit?: number; leavesOnly?: boolean; kinds?: ProductKindKey[] } = {}
): Promise<GameProductSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const pattern = new RegExp(escapeRegExp(trimmed), "i");
  const docs = await db
    .collection<SummaryDoc & { gameId: ObjectId }>(COLLECTION)
    .find(
      {
        gameId,
        $or: [{ id: pattern }, { name: pattern }],
        // Seul un produit sans contenu peut entrer dans le contenu d'un autre.
        ...(leavesOnly ? { $nor: [{ contents: { $exists: true, $not: { $size: 0 } } }] } : {}),
        // Une liste d'armée ne se compose que de figurines : proposer les
        // boîtes et les livres du catalogue ferait du bruit à chaque frappe.
        ...(kinds && kinds.length > 0 ? { kind: { $in: kinds } } : {}),
      },
      { projection: SUMMARY_PROJECTION }
    )
    .sort({ name: 1 })
    .limit(limit)
    .toArray();

  return docs.map(toSummary);
}

function toDetail(doc: Record<string, unknown>): GameProductDetail {
  return {
    id: doc.id as string,
    name: doc.name as string,
    kind: doc.kind as ProductKindKey,
    setCode: doc.setCode as string | undefined,
    image: doc.image as string | undefined,
    contents: Array.isArray(doc.contents) ? (doc.contents as ProductContent[]) : [],
    attributes: (doc.attributes as Record<string, ProductAttributeValue>) ?? {},
    manuallyEditedAt: doc.manuallyEditedAt instanceof Date ? doc.manuallyEditedAt.toISOString() : undefined,
  };
}

export async function getGameProduct(gameId: ObjectId, id: string): Promise<GameProductDetail | null> {
  const doc = await db.collection(COLLECTION).findOne({ gameId, id });
  return doc ? toDetail(doc) : null;
}

/** Produits désignés par leur identifiant, dans l'ordre du catalogue. */
export async function getProductsByIds(gameId: ObjectId, ids: string[]): Promise<GameProductDetail[]> {
  if (ids.length === 0) {
    return [];
  }

  const docs = await db
    .collection(COLLECTION)
    .find({ gameId, id: { $in: [...new Set(ids)] } })
    .toArray();

  return docs.map(toDetail);
}

/** Produits désignés par leur identifiant, dans la forme légère des listes. */
export async function getProductSummariesByIds(
  gameId: ObjectId,
  ids: string[]
): Promise<GameProductSummary[]> {
  if (ids.length === 0) {
    return [];
  }

  const docs = await db
    .collection<SummaryDoc & { gameId: ObjectId }>(COLLECTION)
    .find({ gameId, id: { $in: [...new Set(ids)] } }, { projection: SUMMARY_PROJECTION })
    .toArray();

  return docs.map(toSummary);
}

/**
 * Ce qu'il faut savoir des produits référencés par un contenu pour le valider.
 * Rendu dans la forme attendue par `lib/products/contents.ts`, qui ne connaît
 * pas la base.
 */
export async function getReferencedProducts(gameId: ObjectId, ids: string[]): Promise<ReferencedProduct[]> {
  if (ids.length === 0) {
    return [];
  }

  const docs = await db
    .collection(COLLECTION)
    .find(
      { gameId, id: { $in: [...new Set(ids)] } },
      { projection: { _id: 0, id: 1, name: 1, contents: 1 } }
    )
    .toArray();

  return docs.map((doc) => ({
    id: doc.id as string,
    name: doc.name as string,
    hasContents: Array.isArray(doc.contents) && doc.contents.length > 0,
  }));
}

/** Les produits dont le contenu cite celui-ci — « présent dans », et garde-fou à la suppression. */
export async function getContainersReferencing(gameId: ObjectId, id: string): Promise<GameProductSummary[]> {
  const docs = await db
    .collection<SummaryDoc & { gameId: ObjectId }>(COLLECTION)
    .find({ gameId, "contents.productId": id }, { projection: SUMMARY_PROJECTION })
    .sort({ name: 1 })
    .toArray();

  return docs.map(toSummary);
}

/** Nombre de produits d'un jeu, affiché dans l'administration. */
export async function countGameProducts(gameId: ObjectId): Promise<number> {
  return db.collection(COLLECTION).countDocuments({ gameId });
}

/** Ce qu'on sait des éditions d'un catalogue : celles qui existent, et le reste. */
export type ProductEditionCensus = {
  /**
   * Valeurs distinctes de l'attribut `edition`, triées par ordre alphabétique
   * **inverse** — rien ne date une édition, et ce tri met « Seconde » avant
   * « Première » sans prétendre lire une chronologie.
   */
  editions: { edition: string; count: number }[];
  /** Produits sans édition : invisibles sous tout filtre d'édition. */
  untagged: number;
};

/**
 * Relevé des éditions d'un jeu, pour le filtre des catalogues et le réglage de
 * l'administration.
 *
 * Le compte des produits **sans** édition est rendu avec les autres : c'est lui
 * qui explique une gamme qui se vide dès qu'une édition en cours est choisie, et
 * le taire ferait passer un étiquetage incomplet pour un bug.
 */
export async function getGameProductEditions(gameId: ObjectId): Promise<ProductEditionCensus> {
  const rows = await db
    .collection(COLLECTION)
    .aggregate<{ _id: string | null; count: number }>([
      { $match: { gameId } },
      {
        $group: {
          _id: {
            $let: {
              vars: { edition: `$${PRODUCT_EDITION_FIELD}` },
              // Une édition n'est une édition que si c'est une chaîne non vide :
              // un attribut saisi en nombre ou vidé compte comme absent, sans
              // quoi le filtre proposerait une valeur qui ne rend rien.
              in: {
                $cond: [{ $and: [{ $eq: [{ $type: "$$edition" }, "string"] }, { $ne: ["$$edition", ""] }] }, "$$edition", null],
              },
            },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const editions = rows
    .filter((row): row is { _id: string; count: number } => typeof row._id === "string")
    .map((row) => ({ edition: row._id, count: row.count }))
    .sort((a, b) => b.edition.localeCompare(a.edition));

  return { editions, untagged: rows.find((row) => row._id === null)?.count ?? 0 };
}

/** Gammes utilisées par les produits d'un jeu, pour le filtre de l'exploration. */
export async function getGameProductSetCodes(gameId: ObjectId): Promise<string[]> {
  const setCodes = (await db.collection(COLLECTION).distinct("setCode", { gameId })) as (string | null)[];
  return setCodes.filter((setCode): setCode is string => Boolean(setCode)).sort((a, b) => a.localeCompare(b));
}

/** Les jeux qui ont un catalogue de produits. */
export async function getGameIdsWithProducts(): Promise<ObjectId[]> {
  return (await db.collection(COLLECTION).distinct("gameId")) as ObjectId[];
}

export async function hasProducts(gameId: ObjectId): Promise<boolean> {
  const product = await db.collection(COLLECTION).findOne({ gameId }, { projection: { _id: 1 } });
  return product !== null;
}

/** Forme publique d'un produit, telle que la rendent les routes de catalogue. */
export function toProduct(gameId: string, detail: GameProductDetail): Product {
  return {
    id: detail.id,
    gameId,
    name: detail.name,
    kind: detail.kind,
    image: detail.image,
    setCode: detail.setCode,
    contents: detail.contents,
    attributes: detail.attributes,
  };
}

export type { ProductDb };
