import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { Wishlist, WishlistItem, WishlistOwnerType, WishlistVisibility } from "@/lib/types/Wishlist";
import { getPlayGroupByIdAndUser, getPlayGroupById, getPlayGroupsForUser } from "@/lib/db/play-groups";
import { getUserById } from "@/lib/db/users";
import { getBadgesForUser, type UserBadges } from "@/lib/db/user-badges";
import { ownerHasAdvancedCollection } from "@/lib/db/collection-access";
import { FREE_WISHLIST_LIMIT, canCreateWishlist, isWishlistReadOnly } from "@/lib/wishlists/limits";

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
    isDefault: doc.isDefault === true,
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
    printingId: doc.printingId || undefined,
    printingName: doc.printingName || undefined,
    foil: doc.foil || undefined,
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
  // Rattrape les propriétaires d'avant `isDefault`, qui n'en auraient aucune :
  // toutes leurs listes seraient alors en lecture seule. C'est le chemin
  // qu'emprunte aussi `/api/wishlists/mine`, donc l'ajout rapide.
  await ensureDefaultWishlist(owner);

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

/**
 * Refus d'une liste de plus, faute de gestion avancée de collection.
 *
 * Une classe à part et non un `Error` au message reconnaissable : les appelants
 * doivent pouvoir répondre « il vous faut Joutes Expert » sans lire une chaîne
 * traduite, et l'écran a besoin du chiffre pour l'écrire.
 */
export class WishlistLimitError extends Error {
  constructor(readonly limit: number) {
    // Le message dit aussi la sortie, et pas seulement le refus : il ressort tel
    // quel par l'outil MCP, où un agent n'a que lui pour comprendre quoi
    // répondre. Les routes HTTP, elles, ajoutent un code machine.
    super(
      `Limite de ${limit} liste de souhaits atteinte. La gestion avancée de collection, ` +
        `qui en permet plusieurs, arrive avec Joutes Expert ou Joutes Pro.`
    );
    this.name = "WishlistLimitError";
  }
}

/**
 * Crée une liste de souhaits.
 *
 * **La limite se vérifie ici et non dans les routes**, et c'est délibéré : trois
 * chemins mènent à cette fonction — l'API personnelle, celle d'un groupe de jeu,
 * et l'outil MCP. Une vérification par route en aurait laissé échapper au moins
 * un, et le prochain chemin ajouté serait passé au travers sans que rien ne le
 * signale.
 */
export async function createWishlist(
  owner: WishlistOwner,
  input: { name: string; description?: string; visibility?: WishlistVisibility }
): Promise<Wishlist> {
  const existing = await db.collection(WISHLISTS_COLLECTION).findOne({ ...ownerQuery(owner), name: input.name });
  if (existing) {
    throw new Error("Une liste de souhaits avec ce nom existe déjà");
  }

  const [count, advanced] = await Promise.all([
    db.collection(WISHLISTS_COLLECTION).countDocuments(ownerQuery(owner)),
    ownerHasAdvancedCollection(owner),
  ]);

  if (!canCreateWishlist({ existing: count, advanced })) {
    throw new WishlistLimitError(FREE_WISHLIST_LIMIT);
  }

  const now = new Date();
  const document = {
    ...ownerQuery(owner),
    name: input.name,
    description: input.description,
    visibility: input.visibility || "private",
    // La première liste d'un propriétaire est sa liste par défaut. Le test porte
    // sur l'existence d'une liste **par défaut** et non sur le compte : un
    // propriétaire dont la liste par défaut a été supprimée sans promotion — une
    // base d'avant ce champ — en retrouve une plutôt que de rester sans.
    isDefault: !(await db
      .collection(WISHLISTS_COLLECTION)
      .findOne({ ...ownerQuery(owner), isDefault: true }, { projection: { _id: 1 } })),
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

  await assertWishlistWritable(wishlistId);

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
  const deleted = await db
    .collection(WISHLISTS_COLLECTION)
    .findOneAndDelete({ _id, ...ownerQuery(owner) });
  if (!deleted) {
    return false;
  }

  await db.collection(WISHLIST_ITEMS_COLLECTION).deleteMany({ wishlistId: _id });

  // Supprimer la liste par défaut ne doit pas laisser le propriétaire sans :
  // sans gestion avancée, il n'aurait plus aucune liste modifiable.
  if (deleted.isDefault === true) {
    await ensureDefaultWishlistId(owner);
  }

  return true;
}

/**
 * L'identifiant de la liste par défaut du propriétaire, en la désignant si
 * aucune ne l'est.
 *
 * « La suivante » se lit dans l'ordre de création, celui-là même qui a désigné
 * la première : c'est la seule lecture qui reste stable quand on renomme ou
 * qu'on réordonne.
 *
 * Sert aussi de rattrapage. Il n'y a **aucun système de migration** dans ce
 * dépôt : les listes créées avant ce champ n'en portent aucune, et sans cela
 * leur propriétaire se retrouverait avec des listes toutes en lecture seule — la
 * règle « sauf celle par défaut » n'en épargnant aucune. L'appel est idempotent
 * et converge : une fois la promotion écrite, il ne coûte plus qu'une lecture.
 */
async function ensureDefaultWishlistId(owner: WishlistOwner): Promise<string | null> {
  const existing = await db
    .collection(WISHLISTS_COLLECTION)
    .findOne({ ...ownerQuery(owner), isDefault: true }, { projection: { _id: 1 } });

  if (existing) {
    return existing._id.toString();
  }

  const promoted = await db
    .collection(WISHLISTS_COLLECTION)
    .findOneAndUpdate(
      { ...ownerQuery(owner) },
      { $set: { isDefault: true } },
      { sort: { createdAt: 1 }, returnDocument: "after", projection: { _id: 1 } }
    );

  return promoted ? promoted._id.toString() : null;
}

/** S'assure que ce propriétaire a bien une liste par défaut. */
export async function ensureDefaultWishlist(owner: WishlistOwner): Promise<void> {
  await ensureDefaultWishlistId(owner);
}

/**
 * Refus d'une écriture sur une liste verrouillée.
 *
 * Sans gestion avancée, seule la liste par défaut reste modifiable. Les autres
 * se consultent — rien n'est perdu, et tout redevient utilisable le jour où le
 * propriétaire s'abonne.
 */
export class WishlistReadOnlyError extends Error {
  constructor() {
    super(
      "Cette liste de souhaits est en lecture seule. Sans la gestion avancée de collection " +
        "(Joutes Expert ou Joutes Pro), seule votre liste par défaut reste modifiable."
    );
    this.name = "WishlistReadOnlyError";
  }
}

/**
 * Jette si cette liste ne peut pas être modifiée.
 *
 * Posée sous les écritures plutôt que dans les routes, pour la même raison que
 * la limite de création : plusieurs chemins y mènent — les routes personnelles
 * et de groupe, l'outil MCP —, et une vérification par route en aurait laissé
 * échapper au moins un.
 */
async function assertWishlistWritable(wishlistId: string): Promise<void> {
  if (!ObjectId.isValid(wishlistId)) {
    return;
  }

  const doc = await db
    .collection(WISHLISTS_COLLECTION)
    .findOne({ _id: new ObjectId(wishlistId) }, { projection: { ownerType: 1, ownerId: 1 } });

  // Liste inexistante : ce n'est pas à ce garde de le dire, l'appelant rendra
  // son propre « introuvable ».
  if (!doc) {
    return;
  }

  const owner = { type: doc.ownerType, id: doc.ownerId } as WishlistOwner;
  const [defaultId, advanced] = await Promise.all([
    ensureDefaultWishlistId(owner),
    ownerHasAdvancedCollection(owner),
  ]);

  if (isWishlistReadOnly({ isDefault: defaultId === wishlistId, advanced })) {
    throw new WishlistReadOnlyError();
  }
}

/** Désigne une autre liste comme liste par défaut du propriétaire. */
export async function setDefaultWishlist(wishlistId: string, owner: WishlistOwner): Promise<boolean> {
  if (!ObjectId.isValid(wishlistId)) {
    return false;
  }

  const _id = new ObjectId(wishlistId);
  const target = await db
    .collection(WISHLISTS_COLLECTION)
    .findOne({ _id, ...ownerQuery(owner) }, { projection: { _id: 1 } });

  if (!target) {
    return false;
  }

  // Retirer avant de poser, jamais l'inverse : l'index unique partiel refuserait
  // la seconde écriture s'il existait un instant deux listes marquées.
  await db
    .collection(WISHLISTS_COLLECTION)
    .updateMany({ ...ownerQuery(owner), isDefault: true }, { $unset: { isDefault: "" } });

  await db
    .collection(WISHLISTS_COLLECTION)
    .updateOne({ _id }, { $set: { isDefault: true, updatedAt: new Date() } });

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

export type WishlistOwnerInfo = {
  label: string;
  href: string;
  /** Badges du propriétaire — absents quand la liste appartient à un groupe. */
  badges?: UserBadges;
};

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

    return { label, href: `/users/${tagForUrl}`, badges: await getBadgesForUser(owner.id) };
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
    printingId?: string;
    printingName?: string;
    foil?: boolean;
    quantity?: number;
    note?: string;
  },
  addedByUserId?: string
): Promise<WishlistItem> {
  await assertWishlistWritable(wishlistId);

  const now = new Date();

  // Ré-ajouter une carte déjà présente (même impression, même variante)
  // incrémente sa quantité au lieu de créer un doublon dans la liste ; deux
  // variantes d'une même carte restent en revanche deux souhaits distincts.
  // `null` couvre les items enregistrés avant les variantes, qui n'ont pas le
  // champ.
  //
  // `printingId` n'est pas repris dans `$setOnInsert` : à l'insertion, Mongo
  // construit le document de base à partir des égalités du filtre, qui le
  // portent déjà — l'y ajouter provoquerait un conflit de chemin.
  const result = await db.collection(WISHLIST_ITEMS_COLLECTION).findOneAndUpdate(
    {
      wishlistId: new ObjectId(wishlistId),
      cardId: item.cardId,
      setCode: item.setCode,
      collectorNumber: item.collectorNumber,
      printingId: item.printingId ?? null,
    },
    {
      // Sur un upsert, $inc initialise la quantité à la valeur incrémentée.
      $inc: { quantity: item.quantity ?? 1 },
      $setOnInsert: {
        gameId: new ObjectId(item.gameId),
        gameName: item.gameName,
        gameSlug: item.gameSlug,
        name: item.name,
        image: item.image,
        ...(item.type !== undefined && { type: item.type }),
        ...(item.printingName !== undefined && { printingName: item.printingName }),
        ...(item.foil !== undefined && { foil: item.foil }),
        ...(item.note !== undefined && { note: item.note }),
        ...(addedByUserId !== undefined && { addedByUserId: new ObjectId(addedByUserId) }),
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  await db.collection(WISHLISTS_COLLECTION).updateOne({ _id: new ObjectId(wishlistId) }, { $set: { updatedAt: now } });

  if (!result) {
    throw new Error("Échec de l'ajout à la wishlist");
  }
  return toWishlistItem(result);
}

export async function updateWishlistItem(
  wishlistId: string,
  itemId: string,
  updates: { quantity?: number; note?: string }
): Promise<WishlistItem | null> {
  if (!ObjectId.isValid(itemId)) {
    return null;
  }

  await assertWishlistWritable(wishlistId);

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

  await assertWishlistWritable(wishlistId);

  const result = await db.collection(WISHLIST_ITEMS_COLLECTION).deleteOne({
    _id: new ObjectId(itemId),
    wishlistId: new ObjectId(wishlistId),
  });

  return result.deletedCount === 1;
}

/**
 * Ids (ObjectId) des wishlists de l'utilisateur : personnelles + celles de ses
 * groupes de jeu. Projection sur _id uniquement — pas de calcul d'itemsCount,
 * ces helpers étant appelés à chaque chargement des vues de cartes.
 */
async function getUserWishlistObjectIds(userId: string): Promise<ObjectId[]> {
  const playGroups = await getPlayGroupsForUser(userId);
  const ownerFilters = [
    ownerQuery({ type: "user", id: userId }),
    ...playGroups.map((group) => ownerQuery({ type: "playGroup", id: group.id })),
  ];
  const docs = await db
    .collection(WISHLISTS_COLLECTION)
    .find({ $or: ownerFilters }, { projection: { _id: 1 } })
    .toArray();
  return docs.map((doc) => doc._id);
}

/**
 * Ids (catalogue) des cartes présentes dans les wishlists de l'utilisateur
 * (personnelles + celles de ses groupes de jeu), limités à un jeu. Sert à
 * afficher le cœur « déjà en wishlist » sur les tuiles de cartes.
 */
export async function getWishlistedCardIdsForUser(userId: string, gameId: string): Promise<string[]> {
  if (!ObjectId.isValid(gameId)) {
    return [];
  }

  const wishlistIds = await getUserWishlistObjectIds(userId);
  if (wishlistIds.length === 0) {
    return [];
  }

  const cardIds = await db.collection(WISHLIST_ITEMS_COLLECTION).distinct("cardId", {
    wishlistId: { $in: wishlistIds },
    gameId: new ObjectId(gameId),
  });
  return cardIds.filter((id): id is string => typeof id === "string");
}

/**
 * Ids des wishlists de l'utilisateur (personnelles + groupes de jeu) qui
 * contiennent déjà une carte donnée. Sert à cocher ces listes dans le popover
 * d'ajout à une wishlist.
 */
export async function getWishlistIdsContainingCard(
  userId: string,
  gameId: string,
  cardId: string
): Promise<string[]> {
  if (!ObjectId.isValid(gameId)) {
    return [];
  }

  const wishlistIds = await getUserWishlistObjectIds(userId);
  if (wishlistIds.length === 0) {
    return [];
  }

  const containing = await db.collection(WISHLIST_ITEMS_COLLECTION).distinct("wishlistId", {
    wishlistId: { $in: wishlistIds },
    gameId: new ObjectId(gameId),
    cardId,
  });
  return containing.map((id) => id.toString());
}

export async function createWishlistIndexes() {
  await db.collection(WISHLISTS_COLLECTION).createIndex({ ownerType: 1, ownerId: 1, name: 1 }, { unique: true });
  await db.collection(WISHLISTS_COLLECTION).createIndex({ visibility: 1 });
  // Au plus une liste par défaut et par propriétaire. L'unicité est portée par
  // la base plutôt que par le code : deux requêtes concurrentes qui promeuvent
  // chacune une liste ne peuvent pas en laisser deux marquées.
  await db.collection(WISHLISTS_COLLECTION).createIndex(
    { ownerType: 1, ownerId: 1 },
    { unique: true, partialFilterExpression: { isDefault: true } }
  );
  await db.collection(WISHLIST_ITEMS_COLLECTION).createIndex({ wishlistId: 1 });
  await db.collection(WISHLIST_ITEMS_COLLECTION).createIndex({ wishlistId: 1, gameId: 1 });
}

/** Suppression d'une liste de souhaits sans contrôle du propriétaire (modération). */
export async function deleteWishlistAsModerator(wishlistId: string): Promise<boolean> {
  if (!ObjectId.isValid(wishlistId)) {
    return false;
  }

  const _id = new ObjectId(wishlistId);
  const result = await db.collection(WISHLISTS_COLLECTION).deleteOne({ _id });
  if (result.deletedCount === 0) {
    return false;
  }

  await db.collection(WISHLIST_ITEMS_COLLECTION).deleteMany({ wishlistId: _id });
  return true;
}

/** Supprime toutes les listes de souhaits d'un groupe de jeu (et leurs cartes). */
export async function deleteWishlistsForPlayGroup(playGroupId: string): Promise<number> {
  const wishlists = await db
    .collection(WISHLISTS_COLLECTION)
    .find({ ownerType: "playGroup", ownerId: playGroupId }, { projection: { _id: 1 } })
    .toArray();

  if (wishlists.length === 0) {
    return 0;
  }

  const ids = wishlists.map((wishlist) => wishlist._id);
  await db.collection(WISHLIST_ITEMS_COLLECTION).deleteMany({ wishlistId: { $in: ids } });
  const result = await db.collection(WISHLISTS_COLLECTION).deleteMany({ _id: { $in: ids } });

  return result.deletedCount;
}
