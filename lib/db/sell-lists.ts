import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document, MongoServerError } from "mongodb";
import { SellList, SellListItem, SellListOwnerType } from "@/lib/types/SellList";
import { getPlayGroupByIdAndUser, getPlayGroupById } from "@/lib/db/play-groups";
import { getUserById } from "@/lib/db/users";

const SELL_LISTS_COLLECTION = "sellLists";
const SELL_LIST_ITEMS_COLLECTION = "sellListItems";
const COLLECTION_CARDS_COLLECTION = "collection-cards";

export type SellListOwner = { type: "user"; id: string } | { type: "playGroup"; id: string };

function ownerQuery(owner: SellListOwner): { ownerType: SellListOwnerType; ownerId: string } {
  return { ownerType: owner.type, ownerId: owner.id };
}

/** The field name that identifies this owner on a `collection-cards` document. */
function collectionOwnerField(owner: SellListOwner): "userId" | "playGroupId" {
  return owner.type === "user" ? "userId" : "playGroupId";
}

function toSellList(doc: WithId<Document>, itemsCount = 0): SellList {
  return {
    id: doc._id.toString(),
    ownerType: doc.ownerType,
    ownerId: doc.ownerId,
    description: doc.description || undefined,
    itemsCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toSellListItem(doc: WithId<Document>): SellListItem {
  return {
    id: doc._id.toString(),
    sellListId: doc.sellListId.toString(),
    collectionEntryId: doc.collectionEntryId.toString(),
    cardId: doc.cardId,
    gameId: doc.gameId.toString(),
    gameName: doc.gameName || undefined,
    gameSlug: doc.gameSlug || undefined,
    name: doc.name,
    setCode: doc.setCode,
    collectorNumber: doc.collectorNumber,
    image: doc.image,
    type: doc.type || undefined,
    foil: doc.foil || undefined,
    language: doc.language || undefined,
    condition: doc.condition || undefined,
    grade: typeof doc.grade === "number" ? doc.grade : undefined,
    price: doc.price,
    currency: doc.currency,
    note: doc.note || undefined,
    addedByUserId: doc.addedByUserId ? doc.addedByUserId.toString() : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function countItems(sellListId: ObjectId): Promise<number> {
  return db.collection(SELL_LIST_ITEMS_COLLECTION).countDocuments({ sellListId });
}

export async function getSellListForOwner(owner: SellListOwner): Promise<SellList | null> {
  const doc = await db.collection(SELL_LISTS_COLLECTION).findOne(ownerQuery(owner));
  if (!doc) {
    return null;
  }

  return toSellList(doc, await countItems(doc._id));
}

/** Fetches the owner's sell list, creating an empty one if it doesn't exist yet. */
export async function getOrCreateSellListForOwner(owner: SellListOwner): Promise<SellList> {
  const existing = await getSellListForOwner(owner);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const document = { ...ownerQuery(owner), createdAt: now, updatedAt: now };

  try {
    const result = await db.collection(SELL_LISTS_COLLECTION).insertOne(document);
    return toSellList({ _id: result.insertedId, ...document }, 0);
  } catch (error) {
    // Concurrent creation lost the race against the unique (ownerType, ownerId) index — fetch the winner.
    if (error instanceof MongoServerError && error.code === 11000) {
      const winner = await getSellListForOwner(owner);
      if (winner) return winner;
    }
    throw error;
  }
}

export async function getSellListById(sellListId: string): Promise<SellList | null> {
  if (!ObjectId.isValid(sellListId)) {
    return null;
  }

  const doc = await db.collection(SELL_LISTS_COLLECTION).findOne({ _id: new ObjectId(sellListId) });
  if (!doc) {
    return null;
  }

  return toSellList(doc, await countItems(doc._id));
}

export async function updateSellList(
  sellListId: string,
  owner: SellListOwner,
  updates: { description?: string }
): Promise<SellList | null> {
  if (!ObjectId.isValid(sellListId)) {
    return null;
  }

  const result = await db.collection(SELL_LISTS_COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(sellListId), ...ownerQuery(owner) },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) {
    return null;
  }

  return toSellList(result, await countItems(result._id));
}

export async function deleteSellList(sellListId: string, owner: SellListOwner): Promise<boolean> {
  if (!ObjectId.isValid(sellListId)) {
    return false;
  }

  const _id = new ObjectId(sellListId);
  const result = await db.collection(SELL_LISTS_COLLECTION).deleteOne({ _id, ...ownerQuery(owner) });
  if (result.deletedCount === 0) {
    return false;
  }

  await db.collection(SELL_LIST_ITEMS_COLLECTION).deleteMany({ sellListId: _id });
  return true;
}

/**
 * Sell lists are always public; only editing requires being the owner or a
 * member of the owning play-group. Mirrors `getWishlistAccess`.
 */
export async function getSellListAccess(
  sellList: SellList,
  userId?: string
): Promise<{ canView: true; canEdit: boolean }> {
  let canEdit = false;

  if (userId) {
    if (sellList.ownerType === "user") {
      canEdit = sellList.ownerId === userId;
    } else {
      canEdit = !!(await getPlayGroupByIdAndUser(sellList.ownerId, userId));
    }
  }

  return { canView: true, canEdit };
}

export type SellListOwnerInfo = { label: string; href: string };

/** Display name + profile/group link for a sell list's owner, for "sell list by X" labels. */
export async function getSellListOwnerInfo(
  sellList: Pick<SellList, "ownerType" | "ownerId">
): Promise<SellListOwnerInfo | null> {
  if (sellList.ownerType === "user") {
    const owner = await getUserById(sellList.ownerId);
    if (!owner) {
      return null;
    }

    const hasTag = !!(owner.displayName && owner.discriminator);
    const label = hasTag ? `${owner.displayName}#${owner.discriminator}` : owner.username;
    const tagForUrl = hasTag ? `${owner.displayName}${owner.discriminator}` : owner.username;

    return { label, href: `/users/${tagForUrl}` };
  }

  const group = await getPlayGroupById(sellList.ownerId);
  if (!group) {
    return null;
  }

  return { label: group.name, href: `/play-groups/${group.id}` };
}

export type SellListItemsOptions = {
  gameId?: string;
  setCode?: string;
  type?: string;
  condition?: string;
  foil?: boolean;
  language?: string;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  page?: number;
  limit?: number;
};

export type PaginatedSellListItems = {
  items: SellListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  games: { gameId: string; gameName?: string; gameSlug?: string }[];
  setCodes: string[];
  types: string[];
  conditions: string[];
};

export async function getSellListItems(
  sellListId: string,
  {
    gameId,
    setCode,
    type,
    condition,
    foil,
    language,
    priceMin,
    priceMax,
    search,
    page = 1,
    limit = 48,
  }: SellListItemsOptions = {}
): Promise<PaginatedSellListItems> {
  const sellListObjId = new ObjectId(sellListId);
  const match: Record<string, unknown> = { sellListId: sellListObjId };
  if (gameId) match.gameId = new ObjectId(gameId);
  if (setCode) match.setCode = setCode;
  if (type) match.type = type;
  if (condition) match.condition = condition;
  if (foil !== undefined) match.foil = foil;
  if (language) match.language = language;
  if (priceMin !== undefined || priceMax !== undefined) {
    match.price = {
      ...(priceMin !== undefined && { $gte: priceMin }),
      ...(priceMax !== undefined && { $lte: priceMax }),
    };
  }
  if (search && search.trim()) match.name = { $regex: search.trim(), $options: "i" };

  const collection = db.collection(SELL_LIST_ITEMS_COLLECTION);

  const [total, docs, gameRows, setCodes, types, conditions] = await Promise.all([
    collection.countDocuments(match),
    collection
      .find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    collection
      .aggregate<{ _id: ObjectId; gameName?: string; gameSlug?: string }>([
        { $match: { sellListId: sellListObjId } },
        { $group: { _id: "$gameId", gameName: { $first: "$gameName" }, gameSlug: { $first: "$gameSlug" } } },
      ])
      .toArray(),
    collection.distinct("setCode", { sellListId: sellListObjId }) as Promise<string[]>,
    collection.distinct("type", { sellListId: sellListObjId }) as Promise<string[]>,
    collection.distinct("condition", { sellListId: sellListObjId }) as Promise<string[]>,
  ]);

  return {
    items: docs.map(toSellListItem),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    games: gameRows.map((g) => ({ gameId: g._id.toString(), gameName: g.gameName, gameSlug: g.gameSlug })),
    setCodes: setCodes.filter((s): s is string => typeof s === "string" && s.length > 0).sort(),
    types: types.filter((t): t is string => typeof t === "string" && t.length > 0).sort(),
    conditions: conditions.filter((c): c is string => typeof c === "string" && c.length > 0).sort(),
  };
}

export type AddSellListItemInput = {
  collectionEntryId: string;
  gameId: string;
  gameName?: string;
  gameSlug?: string;
  /** Optional: a seller can list a card for sale without stating a price. */
  price?: number;
  currency?: string;
  note?: string;
};

/**
 * Lists a specific owned physical copy for sale. The copy must belong to the
 * same owner as the sell list — its identifying attributes (name, set,
 * collector number, foil, language, condition, grade) are denormalized
 * directly from the `collection-cards` document, so no `cards` lookup (and
 * therefore no risk of the `cards.id` non-uniqueness fan-out, see
 * lib/db/collection.ts) is needed here.
 */
export async function addSellListItem(
  sellListId: string,
  owner: SellListOwner,
  input: AddSellListItemInput,
  addedByUserId?: string
): Promise<SellListItem> {
  const entry = await db.collection(COLLECTION_CARDS_COLLECTION).findOne({
    _id: new ObjectId(input.collectionEntryId),
    [collectionOwnerField(owner)]: new ObjectId(owner.id),
  });

  if (!entry) {
    throw new Error("Cette carte ne fait pas partie de la collection");
  }

  const now = new Date();
  const document = {
    sellListId: new ObjectId(sellListId),
    collectionEntryId: entry._id,
    cardId: entry.cardId,
    gameId: new ObjectId(input.gameId),
    gameName: input.gameName,
    gameSlug: input.gameSlug,
    name: entry.name,
    setCode: entry.setCode,
    collectorNumber: entry.collectorNumber,
    image: entry.image,
    ...(entry.type !== undefined && { type: entry.type }),
    ...(entry.foil !== undefined && { foil: entry.foil }),
    ...(entry.language !== undefined && { language: entry.language }),
    ...(entry.condition !== undefined && { condition: entry.condition }),
    ...(entry.grade !== undefined && { grade: entry.grade }),
    ...(input.price !== undefined && { price: input.price, currency: input.currency }),
    ...(input.note !== undefined && { note: input.note }),
    ...(addedByUserId !== undefined && { addedByUserId: new ObjectId(addedByUserId) }),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await db.collection(SELL_LIST_ITEMS_COLLECTION).insertOne(document);
    await db.collection(SELL_LISTS_COLLECTION).updateOne({ _id: new ObjectId(sellListId) }, { $set: { updatedAt: now } });

    return toSellListItem({ _id: result.insertedId, ...document });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new Error("Cette carte est déjà en vente");
    }
    throw error;
  }
}

export async function updateSellListItem(
  sellListId: string,
  itemId: string,
  // `price: null` explicitly clears an existing price (the listing stays, without a price); `price: undefined`/absent leaves it untouched.
  updates: { price?: number | null; currency?: string; note?: string }
): Promise<SellListItem | null> {
  if (!ObjectId.isValid(itemId)) {
    return null;
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, "">  = {};

  if (updates.price === null) {
    unset.price = "";
    unset.currency = "";
  } else if (updates.price !== undefined) {
    set.price = updates.price;
    if (updates.currency !== undefined) set.currency = updates.currency;
  }
  if (updates.note !== undefined) set.note = updates.note;

  const result = await db.collection(SELL_LIST_ITEMS_COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(itemId), sellListId: new ObjectId(sellListId) },
    Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
    { returnDocument: "after" }
  );

  return result ? toSellListItem(result) : null;
}

export async function removeSellListItem(sellListId: string, itemId: string): Promise<boolean> {
  if (!ObjectId.isValid(itemId)) {
    return false;
  }

  const result = await db.collection(SELL_LIST_ITEMS_COLLECTION).deleteOne({
    _id: new ObjectId(itemId),
    sellListId: new ObjectId(sellListId),
  });

  return result.deletedCount === 1;
}

/**
 * Cascade hook: call this after removing a `collection-cards` document so any
 * sell-list listing backed by that exact physical copy is removed too.
 */
export async function removeSellListItemByCollectionEntryId(collectionEntryId: string): Promise<boolean> {
  if (!ObjectId.isValid(collectionEntryId)) {
    return false;
  }

  const result = await db
    .collection(SELL_LIST_ITEMS_COLLECTION)
    .deleteOne({ collectionEntryId: new ObjectId(collectionEntryId) });

  return result.deletedCount === 1;
}

/** Bulk variant of `removeSellListItemByCollectionEntryId`, for cascades after a `deleteMany` on `collection-cards`. */
export async function removeSellListItemsByCollectionEntryIds(collectionEntryIds: ObjectId[]): Promise<number> {
  if (collectionEntryIds.length === 0) return 0;

  const result = await db
    .collection(SELL_LIST_ITEMS_COLLECTION)
    .deleteMany({ collectionEntryId: { $in: collectionEntryIds } });

  return result.deletedCount;
}

export type ForSaleInfo = { itemId: string; sellListId: string; price: number; currency: string; note?: string };

/**
 * Batch lookup used by the collection API to annotate owned copies with their
 * sell-list listing (if any), keyed by `collectionEntryId`. Used to show a
 * "for sale" badge and to let CollectionManager unlist a copy without knowing
 * its sell list id upfront.
 */
export async function getForSaleInfoForEntries(collectionEntryIds: ObjectId[]): Promise<Map<string, ForSaleInfo>> {
  if (collectionEntryIds.length === 0) return new Map();

  const docs = await db
    .collection(SELL_LIST_ITEMS_COLLECTION)
    .find(
      { collectionEntryId: { $in: collectionEntryIds } },
      { projection: { _id: 1, sellListId: 1, collectionEntryId: 1, price: 1, currency: 1, note: 1 } }
    )
    .toArray();

  return new Map(
    docs.map((doc) => [
      doc.collectionEntryId.toString(),
      { itemId: doc._id.toString(), sellListId: doc.sellListId.toString(), price: doc.price, currency: doc.currency, note: doc.note },
    ])
  );
}

export async function createSellListIndexes() {
  await db.collection(SELL_LISTS_COLLECTION).createIndex({ ownerType: 1, ownerId: 1 }, { unique: true });
  await db.collection(SELL_LIST_ITEMS_COLLECTION).createIndex({ collectionEntryId: 1 }, { unique: true });
  await db.collection(SELL_LIST_ITEMS_COLLECTION).createIndex({ sellListId: 1 });
  await db.collection(SELL_LIST_ITEMS_COLLECTION).createIndex({ sellListId: 1, gameId: 1 });
}
