import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { Wishlist, WishlistItem, WishlistOwnerType, WishlistVisibility } from "@/lib/types/Wishlist";
import { getPlayGroupByIdAndUser, getPlayGroupById } from "@/lib/db/play-groups";
import { getUserById } from "@/lib/db/users";

const WISHLISTS_COLLECTION = "wishlists";
const WISHLIST_ITEMS_COLLECTION = "wishlist-items";

export type WishlistOwner = { type: "user"; id: string } | { type: "playGroup"; id: string };

function ownerQuery(owner: WishlistOwner): { ownerType: WishlistOwnerType; ownerId: string } {
  return { ownerType: owner.type, ownerId: owner.id };
}

function toWishlist(doc: WithId<Document>, itemsCount = 0): Wishlist {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description || undefined,
    ownerType: doc.ownerType,
    ownerId: doc.ownerId,
    visibility: doc.visibility || "private",
    itemsCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toWishlistItem(doc: WithId<Document>): WishlistItem {
  return {
    id: doc._id.toString(),
    wishlistId: doc.wishlistId.toString(),
    cardId: doc.cardId,
    gameId: doc.gameId.toString(),
    gameName: doc.gameName || undefined,
    gameSlug: doc.gameSlug || undefined,
    name: doc.name,
    setCode: doc.setCode,
    collectorNumber: doc.collectorNumber,
    image: doc.image,
    type: doc.type || undefined,
    quantity: doc.quantity || 1,
    note: doc.note || undefined,
    addedByUserId: doc.addedByUserId ? doc.addedByUserId.toString() : undefined,
    createdAt: doc.createdAt,
    ownedQuantity: typeof doc.ownedQuantity === "number" ? doc.ownedQuantity : undefined,
  };
}

async function attachItemsCounts(docs: WithId<Document>[]): Promise<Wishlist[]> {
  if (docs.length === 0) return [];

  const counts = await db
    .collection(WISHLIST_ITEMS_COLLECTION)
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: { wishlistId: { $in: docs.map((d) => d._id) } } },
      { $group: { _id: "$wishlistId", count: { $sum: 1 } } },
    ])
    .toArray();
  const countsById = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return docs.map((doc) => toWishlist(doc, countsById.get(doc._id.toString()) ?? 0));
}

/**
 * All wishlists owned by a user or play-group, regardless of visibility —
 * used by the owner's own management page.
 */
export async function getWishlistsForOwner(owner: WishlistOwner): Promise<Wishlist[]> {
  const docs = await db
    .collection(WISHLISTS_COLLECTION)
    .find(ownerQuery(owner))
    .sort({ updatedAt: -1 })
    .toArray();

  return attachItemsCounts(docs);
}

/** Public wishlists for a given owner — used on public profile / group pages. */
export async function getPublicWishlistsForOwner(owner: WishlistOwner): Promise<Wishlist[]> {
  const docs = await db
    .collection(WISHLISTS_COLLECTION)
    .find({ ...ownerQuery(owner), visibility: "public" })
    .sort({ updatedAt: -1 })
    .toArray();

  return attachItemsCounts(docs);
}

export async function getWishlistById(wishlistId: string): Promise<Wishlist | null> {
  if (!ObjectId.isValid(wishlistId)) {
    return null;
  }

  const doc = await db.collection(WISHLISTS_COLLECTION).findOne({ _id: new ObjectId(wishlistId) });
  if (!doc) {
    return null;
  }

  const [wishlist] = await attachItemsCounts([doc]);
  return wishlist;
}

export async function createWishlist(
  owner: WishlistOwner,
  input: { name: string; description?: string; visibility?: WishlistVisibility }
): Promise<Wishlist> {
  const existing = await db.collection(WISHLISTS_COLLECTION).findOne({ ...ownerQuery(owner), name: input.name });
  if (existing) {
    throw new Error("Une liste de souhaits avec ce nom existe déjà");
  }

  const now = new Date();
  const document = {
    ...ownerQuery(owner),
    name: input.name,
    description: input.description,
    visibility: input.visibility || "private",
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(WISHLISTS_COLLECTION).insertOne(document);

  return toWishlist({ _id: result.insertedId, ...document });
}

export async function updateWishlist(
  wishlistId: string,
  owner: WishlistOwner,
  updates: { name?: string; description?: string; visibility?: WishlistVisibility }
): Promise<Wishlist | null> {
  if (!ObjectId.isValid(wishlistId)) {
    return null;
  }

  if (updates.name) {
    const existing = await db.collection(WISHLISTS_COLLECTION).findOne({
      ...ownerQuery(owner),
      name: updates.name,
      _id: { $ne: new ObjectId(wishlistId) },
    });
    if (existing) {
      throw new Error("Une liste de souhaits avec ce nom existe déjà");
    }
  }

  const result = await db.collection(WISHLISTS_COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(wishlistId), ...ownerQuery(owner) },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) {
    return null;
  }

  const [wishlist] = await attachItemsCounts([result]);
  return wishlist;
}

export async function deleteWishlist(wishlistId: string, owner: WishlistOwner): Promise<boolean> {
  if (!ObjectId.isValid(wishlistId)) {
    return false;
  }

  const _id = new ObjectId(wishlistId);
  const result = await db.collection(WISHLISTS_COLLECTION).deleteOne({ _id, ...ownerQuery(owner) });
  if (result.deletedCount === 0) {
    return false;
  }

  await db.collection(WISHLIST_ITEMS_COLLECTION).deleteMany({ wishlistId: _id });
  return true;
}

/**
 * Whether the given user (if any) may view/edit a wishlist.
 * Viewing: allowed if visibility isn't "private", or if the user owns it /
 * is a member of the owning play-group. Editing always requires the latter.
 */
export async function getWishlistAccess(
  wishlist: Wishlist,
  userId?: string
): Promise<{ canView: boolean; canEdit: boolean }> {
  let isOwnerOrMember = false;

  if (userId) {
    if (wishlist.ownerType === "user") {
      isOwnerOrMember = wishlist.ownerId === userId;
    } else {
      isOwnerOrMember = !!(await getPlayGroupByIdAndUser(wishlist.ownerId, userId));
    }
  }

  return {
    canView: wishlist.visibility !== "private" || isOwnerOrMember,
    canEdit: isOwnerOrMember,
  };
}

export type WishlistOwnerInfo = { label: string; href: string };

/** Display name + profile/group link for a wishlist's owner, for "wishlist by X" labels. */
export async function getWishlistOwnerInfo(
  wishlist: Pick<Wishlist, "ownerType" | "ownerId">
): Promise<WishlistOwnerInfo | null> {
  if (wishlist.ownerType === "user") {
    const owner = await getUserById(wishlist.ownerId);
    if (!owner) {
      return null;
    }

    const hasTag = !!(owner.displayName && owner.discriminator);
    const label = hasTag ? `${owner.displayName}#${owner.discriminator}` : owner.username;
    const tagForUrl = hasTag ? `${owner.displayName}${owner.discriminator}` : owner.username;

    return { label, href: `/users/${tagForUrl}` };
  }

  const group = await getPlayGroupById(wishlist.ownerId);
  if (!group) {
    return null;
  }

  return { label: group.name, href: `/play-groups/${group.id}` };
}

export type WishlistItemsOptions = {
  gameId?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
  /** Current viewer, used to annotate/filter items by how many the viewer personally owns. */
  viewerId?: string;
  /** Only include items the viewer owns at least this many copies of (requires viewerId). */
  ownedMinQuantity?: number;
};

export type PaginatedWishlistItems = {
  items: WishlistItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  games: { gameId: string; gameName?: string; gameSlug?: string }[];
  types: string[];
};

export async function getWishlistItems(
  wishlistId: string,
  { gameId, type, search, page = 1, limit = 48, viewerId, ownedMinQuantity }: WishlistItemsOptions = {}
): Promise<PaginatedWishlistItems> {
  const wishlistObjId = new ObjectId(wishlistId);
  const match: Record<string, unknown> = { wishlistId: wishlistObjId };
  if (gameId) match.gameId = new ObjectId(gameId);
  if (type) match.type = type;
  if (search && search.trim()) match.name = { $regex: search.trim(), $options: "i" };

  const collection = db.collection(WISHLIST_ITEMS_COLLECTION);

  const ownedLookup: Record<string, unknown>[] = viewerId
    ? [
        {
          $lookup: {
            from: "collection-cards",
            let: { cid: "$cardId" },
            pipeline: [
              {
                $match: {
                  $expr: { $and: [{ $eq: ["$cardId", "$$cid"] }, { $eq: ["$userId", new ObjectId(viewerId)] }] },
                },
              },
              { $count: "n" },
            ],
            as: "owned",
          },
        },
        { $addFields: { ownedQuantity: { $ifNull: [{ $arrayElemAt: ["$owned.n", 0] }, 0] } } },
      ]
    : [];

  const sortSkipLimit: Record<string, unknown>[] = [
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ];

  let countPipeline: Record<string, unknown>[];
  let itemsPipeline: Record<string, unknown>[];

  if (viewerId && ownedMinQuantity !== undefined) {
    // Ownership is only known after the lookup, so it must precede pagination.
    const filtered = [{ $match: match }, ...ownedLookup, { $match: { ownedQuantity: { $gte: ownedMinQuantity } } }];
    countPipeline = [...filtered, { $count: "total" }];
    itemsPipeline = [...filtered, ...sortSkipLimit];
  } else {
    countPipeline = [{ $match: match }, { $count: "total" }];
    itemsPipeline = [{ $match: match }, ...sortSkipLimit, ...ownedLookup];
  }

  const [countRes, docs, gameRows, types] = await Promise.all([
    collection.aggregate<{ total: number }>(countPipeline).toArray(),
    collection.aggregate<WithId<Document>>(itemsPipeline).toArray(),
    collection
      .aggregate<{ _id: ObjectId; gameName?: string; gameSlug?: string }>([
        { $match: { wishlistId: wishlistObjId } },
        { $group: { _id: "$gameId", gameName: { $first: "$gameName" }, gameSlug: { $first: "$gameSlug" } } },
      ])
      .toArray(),
    collection.distinct("type", { wishlistId: wishlistObjId }) as Promise<string[]>,
  ]);

  const total = countRes.length > 0 ? (countRes[0].total as number) : 0;

  return {
    items: docs.map(toWishlistItem),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    games: gameRows.map((g) => ({ gameId: g._id.toString(), gameName: g.gameName, gameSlug: g.gameSlug })),
    types: types.filter((t): t is string => typeof t === "string" && t.length > 0).sort(),
  };
}

export async function addWishlistItem(
  wishlistId: string,
  item: {
    cardId: string;
    gameId: string;
    gameName?: string;
    gameSlug?: string;
    name: string;
    setCode: string;
    collectorNumber: string;
    image: string;
    type?: string;
    quantity?: number;
    note?: string;
  },
  addedByUserId?: string
): Promise<WishlistItem> {
  const now = new Date();
  const document = {
    wishlistId: new ObjectId(wishlistId),
    cardId: item.cardId,
    gameId: new ObjectId(item.gameId),
    gameName: item.gameName,
    gameSlug: item.gameSlug,
    name: item.name,
    setCode: item.setCode,
    collectorNumber: item.collectorNumber,
    image: item.image,
    ...(item.type !== undefined && { type: item.type }),
    quantity: item.quantity ?? 1,
    ...(item.note !== undefined && { note: item.note }),
    ...(addedByUserId !== undefined && { addedByUserId: new ObjectId(addedByUserId) }),
    createdAt: now,
  };

  const result = await db.collection(WISHLIST_ITEMS_COLLECTION).insertOne(document);
  await db.collection(WISHLISTS_COLLECTION).updateOne({ _id: new ObjectId(wishlistId) }, { $set: { updatedAt: now } });

  return toWishlistItem({ _id: result.insertedId, ...document });
}

export async function updateWishlistItem(
  wishlistId: string,
  itemId: string,
  updates: { quantity?: number; note?: string }
): Promise<WishlistItem | null> {
  if (!ObjectId.isValid(itemId)) {
    return null;
  }

  const result = await db.collection(WISHLIST_ITEMS_COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(itemId), wishlistId: new ObjectId(wishlistId) },
    { $set: updates },
    { returnDocument: "after" }
  );

  return result ? toWishlistItem(result) : null;
}

export async function removeWishlistItem(wishlistId: string, itemId: string): Promise<boolean> {
  if (!ObjectId.isValid(itemId)) {
    return false;
  }

  const result = await db.collection(WISHLIST_ITEMS_COLLECTION).deleteOne({
    _id: new ObjectId(itemId),
    wishlistId: new ObjectId(wishlistId),
  });

  return result.deletedCount === 1;
}

export async function createWishlistIndexes() {
  await db.collection(WISHLISTS_COLLECTION).createIndex({ ownerType: 1, ownerId: 1, name: 1 }, { unique: true });
  await db.collection(WISHLISTS_COLLECTION).createIndex({ visibility: 1 });
  await db.collection(WISHLIST_ITEMS_COLLECTION).createIndex({ wishlistId: 1 });
  await db.collection(WISHLIST_ITEMS_COLLECTION).createIndex({ wishlistId: 1, gameId: 1 });
}
