import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { ownerMatch, type CollectionOwner } from "@/lib/db/collection";
import { flattenContents } from "@/lib/products/contents";
import {
  contentCompletion,
  type ContentCompletion,
  type ProductCopies,
} from "@/lib/collection/product-ownership";
import { DEFAULT_PAINT_STATE, isPainted, type PaintStateKey } from "@/lib/constants/paint-states";
import type { ProductKindKey } from "@/lib/constants/product-kinds";
import type { CollectionProductDb, CollectionProductEntry, ProductContent } from "@/lib/types/product";
import type { CollectionCurrency } from "@/lib/schemas/collection.schema";
import { productSearchFilter } from "@/lib/collection/search";
import { getGameProductSetCodes } from "@/lib/db/products";
import { removeSellListItemsByCollectionEntryIds } from "@/lib/db/sell-lists";

/**
 * Collection de produits — le pendant de `lib/db/collection.ts` pour les jeux de
 * figurines.
 *
 * Deux différences de fond avec le modèle des cartes, toutes deux voulues :
 *
 *  - un exemplaire porte son `gameId`, il n'est pas retrouvé par jointure. Sans
 *    lui, un jeu sans cartes resterait invisible dans la vue d'ensemble.
 *  - la complétion ne se compte pas en « master set » / « game set » mais en
 *    références du catalogue et en figurines : les boîtes sont un moyen, la
 *    gamme de figurines est la fin.
 */

const PRODUCTS = "products";
const ENTRIES = "collection-products";

export type ProductSetCompletion = {
  setCode: string;
  productsOwned: number;
  productsTotal: number;
  unitsOwned: number;
  unitsTotal: number;
};

export type ProductCollectionStats = {
  gameId: string;
  name: string;
  slug?: string;
  icon?: string;
  color?: string;
  type: string;
  /** Exemplaires possédés, tous produits confondus. */
  copies: number;
  productsOwned: number;
  productsTotal: number;
  /** Produits sans contenu : les figurines, ce que le joueur collectionne vraiment. */
  unitsOwned: number;
  unitsTotal: number;
  paintedCopies: number;
  /** Exemplaires susceptibles d'être peints (les feuilles), dénominateur de la peinture. */
  paintableCopies: number;
  sets: ProductSetCompletion[];
};

/** Un produit du catalogue, annoté de ce que le propriétaire en possède. */
export type ProductCollectionItem = {
  id: string;
  name: string;
  kind: ProductKindKey;
  setCode?: string;
  image?: string;
  contents: ProductContent[];
  quantity: number;
  /** Complétude du contenu, toutes provenances confondues. */
  content: ContentCompletion;
};

export type ProductCollectionResult = {
  items: ProductCollectionItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  setCodes: string[];
  stats: ProductCollectionStats | null;
};

type EntryDoc = CollectionProductDb & { _id: ObjectId };

function toEntry(doc: EntryDoc): CollectionProductEntry {
  return {
    id: doc._id.toString(),
    productId: doc.productId,
    name: doc.name,
    image: doc.image,
    kind: doc.kind,
    setCode: doc.setCode,
    paintState: doc.paintState,
    sealed: doc.sealed,
    obtainedAt: doc.obtainedAt,
    acquisitionPrice: doc.acquisitionPrice,
    acquisitionCurrency: doc.acquisitionCurrency,
    note: doc.note,
    borrowedBy: doc.borrowedBy,
    fromProductEntryId: doc.fromProductEntryId?.toString(),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date().toISOString(),
  };
}

/** Exemplaires possédés par identifiant de produit, pour un jeu. */
export async function getProductCopies(owner: CollectionOwner, gameId: ObjectId): Promise<ProductCopies> {
  const rows = await db
    .collection(ENTRIES)
    .aggregate<{ _id: string; count: number }>([
      { $match: { ...ownerMatch(owner), gameId } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ])
    .toArray();

  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

/**
 * Statistiques de complétion par jeu. Contrairement à `getGamesStats`, aucun
 * `$lookup` : le `gameId` est porté par l'exemplaire.
 */
export async function getProductGamesStats(
  owner: CollectionOwner,
  gameIds: ObjectId[]
): Promise<ProductCollectionStats[]> {
  if (gameIds.length === 0) {
    return [];
  }

  // --- Le catalogue : les dénominateurs ---
  const catalog = await db
    .collection(PRODUCTS)
    .aggregate<{
      _id: { gameId: ObjectId; setCode: string | null };
      productsTotal: number;
      unitsTotal: number;
      ids: string[];
      unitIds: string[];
    }>([
      { $match: { gameId: { $in: gameIds } } },
      {
        $addFields: {
          isUnit: { $eq: [{ $size: { $ifNull: ["$contents", []] } }, 0] },
        },
      },
      {
        $group: {
          _id: { gameId: "$gameId", setCode: { $ifNull: ["$setCode", null] } },
          productsTotal: { $sum: 1 },
          unitsTotal: { $sum: { $cond: ["$isUnit", 1, 0] } },
          ids: { $addToSet: "$id" },
          unitIds: { $addToSet: { $cond: ["$isUnit", "$id", "$$REMOVE"] } },
        },
      },
    ])
    .toArray();

  if (catalog.length === 0) {
    return [];
  }

  // --- Ce que le propriétaire possède ---
  const owned = await db
    .collection(ENTRIES)
    .aggregate<{
      _id: { gameId: ObjectId; productId: string };
      copies: number;
      paintedCopies: number;
    }>([
      { $match: { ...ownerMatch(owner), gameId: { $in: gameIds } } },
      {
        $group: {
          _id: { gameId: "$gameId", productId: "$productId" },
          copies: { $sum: 1 },
          paintedCopies: {
            $sum: { $cond: [{ $in: ["$paintState", ["painted", "based"]] }, 1, 0] },
          },
        },
      },
    ])
    .toArray();

  const ownedByGame = new Map<string, Map<string, { copies: number; paintedCopies: number }>>();
  for (const row of owned) {
    const gid = row._id.gameId.toString();
    const byProduct = ownedByGame.get(gid) ?? new Map();
    byProduct.set(row._id.productId, { copies: row.copies, paintedCopies: row.paintedCopies });
    ownedByGame.set(gid, byProduct);
  }

  // --- Métadonnées de jeu ---
  const gameDocs = await db
    .collection("games")
    .find(
      { _id: { $in: gameIds } },
      { projection: { name: 1, slug: 1, icon: 1, color: 1, type: 1, images: 1 } }
    )
    .toArray();

  const gameMeta = new Map(
    gameDocs.map((doc) => [
      doc._id.toString(),
      {
        name: doc.name as string,
        slug: doc.slug as string | undefined,
        icon: (doc.icon ?? doc.images?.icon) as string | undefined,
        color: doc.color as string | undefined,
        type: (doc.type as string) ?? "Other",
      },
    ])
  );

  const catalogByGame = new Map<string, typeof catalog>();
  for (const row of catalog) {
    const gid = row._id.gameId.toString();
    catalogByGame.set(gid, [...(catalogByGame.get(gid) ?? []), row]);
  }

  const results: ProductCollectionStats[] = [];

  for (const [gid, rows] of catalogByGame) {
    const ownedProducts = ownedByGame.get(gid) ?? new Map();
    const meta = gameMeta.get(gid);

    const sets: ProductSetCompletion[] = [];
    let productsOwned = 0;
    let productsTotal = 0;
    let unitsOwned = 0;
    let unitsTotal = 0;
    let copies = 0;
    let paintedCopies = 0;
    let paintableCopies = 0;

    for (const row of rows) {
      const setOwned = row.ids.filter((id) => (ownedProducts.get(id)?.copies ?? 0) > 0).length;
      const setUnitsOwned = row.unitIds.filter((id) => (ownedProducts.get(id)?.copies ?? 0) > 0).length;

      productsOwned += setOwned;
      productsTotal += row.productsTotal;
      unitsOwned += setUnitsOwned;
      unitsTotal += row.unitsTotal;

      for (const id of row.ids) {
        copies += ownedProducts.get(id)?.copies ?? 0;
      }
      // Seules les figurines se peignent : une boîte dans le dénominateur
      // plafonnerait le taux de peinture sous les 100 %, pour toujours.
      for (const id of row.unitIds) {
        const entry = ownedProducts.get(id);
        paintableCopies += entry?.copies ?? 0;
        paintedCopies += entry?.paintedCopies ?? 0;
      }

      if (row._id.setCode) {
        sets.push({
          setCode: row._id.setCode,
          productsOwned: setOwned,
          productsTotal: row.productsTotal,
          unitsOwned: setUnitsOwned,
          unitsTotal: row.unitsTotal,
        });
      }
    }

    results.push({
      gameId: gid,
      name: meta?.name ?? gid,
      slug: meta?.slug,
      icon: meta?.icon,
      color: meta?.color,
      type: meta?.type ?? "Other",
      copies,
      productsOwned,
      productsTotal,
      unitsOwned,
      unitsTotal,
      paintedCopies,
      paintableCopies,
      sets: sets.sort((a, b) => a.setCode.localeCompare(b.setCode)),
    });
  }

  return results;
}

/** Les jeux dans lesquels le propriétaire possède au moins un produit. */
export async function getOwnedProductGameIds(owner: CollectionOwner): Promise<ObjectId[]> {
  return (await db.collection(ENTRIES).distinct("gameId", ownerMatch(owner))) as ObjectId[];
}

/**
 * Catalogue paginé d'un jeu, chaque produit annoté de ce que le propriétaire en
 * possède et de la complétude de son contenu.
 *
 * La complétude est calculée sur **tout** le catalogue possédé du jeu, pas sur
 * la page : une boîte de la page 1 peut être complétée par une figurine de la
 * page 3.
 */
export async function getProductCollection({
  owner,
  gameId,
  setCode,
  kind,
  search,
  owned,
  containers,
  page = 1,
  limit = 48,
}: {
  owner: CollectionOwner;
  gameId: string;
  setCode?: string;
  kind?: string;
  search?: string;
  /** true = possédés seulement, false = non possédés seulement, undefined = tous */
  owned?: boolean;
  /** true = conteneurs seulement, false = figurines seulement, undefined = tous */
  containers?: boolean;
  page?: number;
  limit?: number;
}): Promise<ProductCollectionResult> {
  const gameObjId = new ObjectId(gameId);

  const [copies, setCodes, stats] = await Promise.all([
    getProductCopies(owner, gameObjId),
    getGameProductSetCodes(gameObjId),
    getProductGamesStats(owner, [gameObjId]).then((rows) => rows[0] ?? null),
  ]);

  const match: Record<string, unknown> = { gameId: gameObjId };
  if (setCode && setCode !== "all") match.setCode = setCode;
  if (kind && kind !== "all") match.kind = kind;

  const searchFilter = productSearchFilter(search);
  if (searchFilter) Object.assign(match, searchFilter);

  if (containers === true) {
    match.contents = { $exists: true, $not: { $size: 0 } };
  } else if (containers === false) {
    match.$nor = [{ contents: { $exists: true, $not: { $size: 0 } } }];
  }

  if (owned !== undefined) {
    const ownedIds = Object.entries(copies)
      .filter(([, count]) => count > 0)
      .map(([id]) => id);
    match.id = owned ? { $in: ownedIds } : { $nin: ownedIds };
  }

  const total = await db.collection(PRODUCTS).countDocuments(match);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const docs = await db
    .collection(PRODUCTS)
    .find(match, { projection: { _id: 0, id: 1, name: 1, kind: 1, setCode: 1, image: 1, contents: 1 } })
    .sort({ setCode: 1, name: 1 })
    .skip((safePage - 1) * limit)
    .limit(limit)
    .toArray();

  const items: ProductCollectionItem[] = docs.map((doc) => {
    const contents = Array.isArray(doc.contents) ? (doc.contents as ProductContent[]) : [];
    return {
      id: doc.id as string,
      name: doc.name as string,
      kind: doc.kind as ProductKindKey,
      setCode: doc.setCode as string | undefined,
      image: doc.image as string | undefined,
      contents,
      quantity: copies[doc.id as string] ?? 0,
      content: contentCompletion(contents, copies),
    };
  });

  return { items, total, page: safePage, limit, totalPages, setCodes, stats };
}

/** Les exemplaires possédés d'un produit, du plus ancien au plus récent. */
export async function getProductEntries(
  owner: CollectionOwner,
  gameId: string,
  productId: string
): Promise<CollectionProductEntry[]> {
  const docs = await db
    .collection<EntryDoc>(ENTRIES)
    .find({ ...ownerMatch(owner), gameId: new ObjectId(gameId), productId })
    .sort({ _id: 1 })
    .toArray();

  return docs.map(toEntry);
}

/**
 * Les exemplaires apportés par un exemplaire de conteneur, groupés par produit.
 * Sert la complétude « rien n'est sorti de cette boîte-là ».
 */
export async function getBroughtCopies(
  owner: CollectionOwner,
  entryIds: ObjectId[]
): Promise<Map<string, ProductCopies>> {
  if (entryIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .collection(ENTRIES)
    .aggregate<{ _id: { from: ObjectId; productId: string }; count: number }>([
      { $match: { ...ownerMatch(owner), fromProductEntryId: { $in: entryIds } } },
      { $group: { _id: { from: "$fromProductEntryId", productId: "$productId" }, count: { $sum: 1 } } },
    ])
    .toArray();

  const byEntry = new Map<string, ProductCopies>();
  for (const row of rows) {
    const key = row._id.from.toString();
    const copies = byEntry.get(key) ?? {};
    copies[row._id.productId] = row.count;
    byEntry.set(key, copies);
  }

  return byEntry;
}

export type AddProductInput = {
  productId: string;
  addContents?: boolean;
  /** Sous-ensemble du contenu à verser ; absent = tout le contenu. */
  contents?: string[];
  paintState?: PaintStateKey;
  sealed?: boolean;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CollectionCurrency;
  note?: string;
};

export type AddProductResult = {
  entryId: string;
  addedContents: number;
  /** Références du contenu absentes du catalogue, ignorées mais rapportées. */
  missing: string[];
};

/**
 * Ajoute un exemplaire de produit et, s'il en a un, son contenu.
 *
 * Calque de `addBoosterToCollection` (`lib/db/boosters.ts`), avec deux
 * précisions qui lui sont propres :
 *
 *  - **le conteneur est inséré avant son contenu.** Aucune session Mongo n'est
 *    ouverte (le dépôt n'en utilise nulle part, et le replica set n'est pas
 *    garanti) : un incident entre les deux écritures laisse une boîte sans
 *    contenu, que l'interface sait montrer et réparer. L'ordre inverse laisserait
 *    des figurines orphelines, impossibles à rattacher.
 *  - **le prix d'acquisition ne s'hérite pas.** Recopier le prix de la boîte sur
 *    chacune de ses figurines doublerait la valeur de la collection. La date, elle,
 *    s'hérite : tout est entré dans la collection le même jour.
 */
export async function addProductToCollection(
  owner: CollectionOwner,
  gameId: string,
  input: AddProductInput,
  addedByUserId?: string
): Promise<AddProductResult | null> {
  const gameObjId = new ObjectId(gameId);

  const product = await db.collection(PRODUCTS).findOne({ gameId: gameObjId, id: input.productId });
  if (!product) {
    return null;
  }

  const ownerFields = {
    ...ownerMatch(owner),
    ...(owner.type === "playGroup" && addedByUserId ? { addedByUserId: new ObjectId(addedByUserId) } : {}),
  };

  const shared = {
    ...ownerFields,
    gameId: gameObjId,
    ...(input.obtainedAt !== undefined && { obtainedAt: input.obtainedAt }),
    ...(input.sealed ? { sealed: true } : {}),
  };

  const insert = await db.collection(ENTRIES).insertOne({
    ...shared,
    productId: product.id as string,
    name: product.name as string,
    ...(product.image ? { image: product.image as string } : {}),
    kind: product.kind as ProductKindKey,
    ...(product.setCode ? { setCode: product.setCode as string } : {}),
    ...(input.paintState !== undefined && { paintState: input.paintState }),
    ...(input.acquisitionPrice !== undefined && { acquisitionPrice: input.acquisitionPrice }),
    ...(input.acquisitionCurrency !== undefined && { acquisitionCurrency: input.acquisitionCurrency }),
    ...(input.note !== undefined && { note: input.note }),
    createdAt: new Date(),
  });

  const entryId = insert.insertedId;
  const catalogContents = Array.isArray(product.contents) ? (product.contents as ProductContent[]) : [];

  if (input.addContents === false || catalogContents.length === 0) {
    return { entryId: entryId.toString(), addedContents: 0, missing: [] };
  }

  // Une boîte d'occasion arrive souvent incomplète : l'utilisateur décoche ce
  // qui manque, et seul le reste est versé.
  const kept = input.contents
    ? catalogContents.filter((line) => input.contents?.includes(line.productId))
    : catalogContents;

  const units = flattenContents(kept);
  if (units.length === 0) {
    return { entryId: entryId.toString(), addedContents: 0, missing: [] };
  }

  const contained = await db
    .collection(PRODUCTS)
    .find({ gameId: gameObjId, id: { $in: [...new Set(units)] } })
    .toArray();

  const byId = new Map(contained.map((doc) => [doc.id as string, doc]));
  const missing = [...new Set(units.filter((id) => !byId.has(id)))];

  const documents = units.flatMap((productId) => {
    const doc = byId.get(productId);
    if (!doc) return [];

    return [{
      ...shared,
      productId,
      name: doc.name as string,
      ...(doc.image ? { image: doc.image as string } : {}),
      kind: doc.kind as ProductKindKey,
      ...(doc.setCode ? { setCode: doc.setCode as string } : {}),
      paintState: input.paintState ?? DEFAULT_PAINT_STATE,
      fromProductEntryId: entryId,
      createdAt: new Date(),
    }];
  });

  if (documents.length > 0) {
    await db.collection(ENTRIES).insertMany(documents);
  }

  return { entryId: entryId.toString(), addedContents: documents.length, missing };
}

/**
 * Retire un exemplaire, et avec lui ce qu'il a apporté. Une figurine détachée
 * ne porte plus de `fromProductEntryId` : elle survit au retrait de sa boîte.
 */
export async function removeProductEntry(
  owner: CollectionOwner,
  entryId: string
): Promise<{ removed: number } | null> {
  if (!ObjectId.isValid(entryId)) {
    return null;
  }

  const _id = new ObjectId(entryId);
  const entry = await db.collection<EntryDoc>(ENTRIES).findOne({ _id, ...ownerMatch(owner) });
  if (!entry) {
    return null;
  }

  const brought = await db
    .collection(ENTRIES)
    .find({ ...ownerMatch(owner), fromProductEntryId: _id }, { projection: { _id: 1 } })
    .toArray();

  // Défensif : les produits ne sont pas encore vendables, mais l'appel est
  // indexé et sera juste le jour où ils le deviendront.
  await removeSellListItemsByCollectionEntryIds([_id, ...brought.map((doc) => doc._id)]);

  const result = await db.collection(ENTRIES).deleteMany({
    ...ownerMatch(owner),
    $or: [{ _id }, { fromProductEntryId: _id }],
  });

  return { removed: result.deletedCount };
}

export type UpdateProductEntryInput = {
  paintState?: PaintStateKey | null;
  sealed?: boolean;
  obtainedAt?: string | null;
  acquisitionPrice?: number | null;
  acquisitionCurrency?: CollectionCurrency | null;
  note?: string | null;
  borrowedBy?: string | null;
  detach?: true;
};

/**
 * Modifie un exemplaire. Un champ à `null` est retiré du document plutôt que
 * stocké tel quel, comme partout ailleurs dans la collection.
 *
 * Deux effets de bord assumés :
 *
 *  - **desceller un conteneur descelle ce qu'il a apporté.** « J'ai ouvert la
 *    boîte » vaut pour tout ce qu'elle contenait ; laisser les figurines scellées
 *    demanderait de les descellier une à une.
 *  - **détacher est à sens unique.** Il n'existe pas de rattachement : la
 *    provenance décrit d'où une figurine est sortie, pas où elle est rangée.
 */
export async function updateProductEntry(
  owner: CollectionOwner,
  entryId: string,
  input: UpdateProductEntryInput
): Promise<boolean> {
  if (!ObjectId.isValid(entryId)) {
    return false;
  }

  const _id = new ObjectId(entryId);
  const set: Record<string, unknown> = {};
  const unset: Record<string, string> = {};

  const assign = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (value === null) unset[key] = "";
    else set[key] = value;
  };

  assign("paintState", input.paintState);
  assign("obtainedAt", input.obtainedAt);
  assign("acquisitionPrice", input.acquisitionPrice);
  assign("acquisitionCurrency", input.acquisitionCurrency);
  assign("note", input.note);
  assign("borrowedBy", input.borrowedBy);

  // `sealed` n'est écrit que lorsqu'il vaut `true`, comme le `foil` d'une carte.
  if (input.sealed === true) set.sealed = true;
  if (input.sealed === false) unset.sealed = "";
  if (input.detach) unset.fromProductEntryId = "";

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return false;
  }

  const result = await db.collection(ENTRIES).updateOne(
    { _id, ...ownerMatch(owner) },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    }
  );

  if (result.matchedCount === 0) {
    return false;
  }

  if (input.sealed === false) {
    await db.collection(ENTRIES).updateMany(
      { ...ownerMatch(owner), fromProductEntryId: _id, sealed: true },
      { $unset: { sealed: "" } }
    );
  }

  return true;
}

/** Réexporté pour les vues, qui comptent les figurines peintes sans relire la base. */
export { isPainted };
