import 'server-only';
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { Game } from "@/lib/types/Game";

/**
 * Collection completion model.
 *
 * An "item" is a distinct (setCode, collectorNumber) printing in the catalog.
 * Language and foil are ignored (they are per-copy attributes, not distinct items).
 *
 *  - Master Set: own at least one copy of every item (every collector number).
 *  - Game Set:   own at least one copy of every unique card name (a "variant" is
 *                the same name under a different collector number, e.g. alt arts).
 */

export type SetCompletion = {
  setCode: string;
  masterOwned: number;
  masterTotal: number;
  gameOwned: number;
  gameTotal: number;
};

export type GameCollectionStats = {
  gameId: string;
  name: string;
  slug?: string;
  icon?: string;
  color?: string;
  type: string;
  copies: number;
  masterOwned: number;
  masterTotal: number;
  gameOwned: number;
  gameTotal: number;
  sets: SetCompletion[];
};

export type CollectionOverview = {
  totalCopies: number;
  masterOwned: number;
  masterTotal: number;
  gameOwned: number;
  gameTotal: number;
  gamesWithItems: number;
  games: GameCollectionStats[];
};

type FacetCount = { masterOwned?: number; masterTotal?: number; gameOwned?: number; gameTotal?: number; copies?: number };

/**
 * A collection can be owned either by an individual user (their personal
 * collection) or shared by a whole play-group (any member can add/remove
 * cards). `collection-cards` documents carry either a `userId` or a
 * `playGroupId` field (never both), and every query below matches on
 * whichever field applies to the given owner.
 */
export type CollectionOwner = { type: "user"; id: string } | { type: "playGroup"; id: string };

function ownerField(owner: CollectionOwner): "userId" | "playGroupId" {
  return owner.type === "user" ? "userId" : "playGroupId";
}

function ownerMatch(owner: CollectionOwner): Record<string, ObjectId> {
  return { [ownerField(owner)]: new ObjectId(owner.id) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compute per-game / per-set completion stats for the given games.
 * Games with no catalog data are skipped.
 */
export async function getGamesStats(
  owner: CollectionOwner,
  gameIds: ObjectId[]
): Promise<GameCollectionStats[]> {
  if (gameIds.length === 0) {
    return [];
  }

  // --- Owned stats (from the owner's individual copies, joined to the catalog) ---
  const [ownedFacet] = await db
    .collection("collection-cards")
    .aggregate<{
      bySet: { _id: { gameId: ObjectId; setCode: string } } & FacetCount[][0];
      byGame: { _id: ObjectId } & FacetCount;
    }>([
      { $match: ownerMatch(owner) },
      { $lookup: { from: "cards", localField: "cardId", foreignField: "id", as: "c" } },
      // cards.id is not strictly unique (a few tokens/promos share an id); take a
      // single catalog match per owned copy so the join never fans a copy out.
      { $addFields: { c: { $arrayElemAt: ["$c", 0] } } },
      { $match: { "c.gameId": { $in: gameIds } } },
      // one row per owned item (distinct collector number)
      {
        $group: {
          _id: { gameId: "$c.gameId", setCode: "$c.setCode", collectorNumber: "$c.collectorNumber" },
          name: { $first: "$c.name" },
          copies: { $sum: 1 },
        },
      },
      {
        $facet: {
          bySet: [
            {
              $group: {
                _id: { gameId: "$_id.gameId", setCode: "$_id.setCode" },
                masterOwned: { $sum: 1 },
                names: { $addToSet: "$name" },
                copies: { $sum: "$copies" },
              },
            },
            { $project: { masterOwned: 1, gameOwned: { $size: "$names" }, copies: 1 } },
          ],
          byGame: [
            {
              $group: {
                _id: "$_id.gameId",
                masterOwned: { $sum: 1 },
                names: { $addToSet: "$name" },
                copies: { $sum: "$copies" },
              },
            },
            { $project: { masterOwned: 1, gameOwned: { $size: "$names" }, copies: 1 } },
          ],
        },
      },
    ])
    .toArray() as unknown as [
    {
      bySet: Array<{ _id: { gameId: ObjectId; setCode: string }; masterOwned: number; gameOwned: number; copies: number }>;
      byGame: Array<{ _id: ObjectId; masterOwned: number; gameOwned: number; copies: number }>;
    }
  ];

  // --- Catalog universe (denominators) ---
  const [universeFacet] = await db
    .collection("cards")
    .aggregate([
      { $match: { gameId: { $in: gameIds } } },
      // one row per distinct item (dedupe languages sharing a collector number)
      {
        $group: {
          _id: { gameId: "$gameId", setCode: "$setCode", collectorNumber: "$collectorNumber" },
          name: { $first: "$name" },
        },
      },
      {
        $facet: {
          bySet: [
            {
              $group: {
                _id: { gameId: "$_id.gameId", setCode: "$_id.setCode" },
                masterTotal: { $sum: 1 },
                names: { $addToSet: "$name" },
              },
            },
            { $project: { masterTotal: 1, gameTotal: { $size: "$names" } } },
          ],
          byGame: [
            {
              $group: {
                _id: "$_id.gameId",
                masterTotal: { $sum: 1 },
                names: { $addToSet: "$name" },
              },
            },
            { $project: { masterTotal: 1, gameTotal: { $size: "$names" } } },
          ],
        },
      },
    ])
    .toArray() as unknown as [
    {
      bySet: Array<{ _id: { gameId: ObjectId; setCode: string }; masterTotal: number; gameTotal: number }>;
      byGame: Array<{ _id: ObjectId; masterTotal: number; gameTotal: number }>;
    }
  ];

  // --- Game metadata ---
  const gameDocs = await db
    .collection("games")
    .find(
      { _id: { $in: gameIds } },
      { projection: { name: 1, slug: 1, icon: 1, color: 1, type: 1, images: 1 } }
    )
    .toArray();

  const gameMeta = new Map<string, { name: string; slug?: string; icon?: string; color?: string; type: string }>();
  for (const g of gameDocs) {
    gameMeta.set(g._id.toString(), {
      name: g.name,
      slug: g.slug,
      icon: g.icon ?? g.images?.icon,
      color: g.color,
      type: g.type,
    });
  }

  const ownedByGame = new Map<string, { masterOwned: number; gameOwned: number; copies: number }>();
  for (const row of ownedFacet?.byGame ?? []) {
    ownedByGame.set(row._id.toString(), { masterOwned: row.masterOwned, gameOwned: row.gameOwned, copies: row.copies });
  }
  const ownedBySet = new Map<string, { masterOwned: number; gameOwned: number }>();
  for (const row of ownedFacet?.bySet ?? []) {
    ownedBySet.set(`${row._id.gameId.toString()}|${row._id.setCode}`, { masterOwned: row.masterOwned, gameOwned: row.gameOwned });
  }
  const universeByGame = new Map<string, { masterTotal: number; gameTotal: number }>();
  for (const row of universeFacet?.byGame ?? []) {
    universeByGame.set(row._id.toString(), { masterTotal: row.masterTotal, gameTotal: row.gameTotal });
  }
  const universeSetsByGame = new Map<string, Array<{ setCode: string; masterTotal: number; gameTotal: number }>>();
  for (const row of universeFacet?.bySet ?? []) {
    const gid = row._id.gameId.toString();
    const list = universeSetsByGame.get(gid) ?? [];
    list.push({ setCode: row._id.setCode, masterTotal: row.masterTotal, gameTotal: row.gameTotal });
    universeSetsByGame.set(gid, list);
  }

  const results: GameCollectionStats[] = [];
  for (const gid of gameIds) {
    const gidStr = gid.toString();
    const universe = universeByGame.get(gidStr);
    if (!universe) continue; // no catalog for this game
    const meta = gameMeta.get(gidStr);
    const owned = ownedByGame.get(gidStr) ?? { masterOwned: 0, gameOwned: 0, copies: 0 };

    const sets: SetCompletion[] = (universeSetsByGame.get(gidStr) ?? [])
      .map((s) => {
        const o = ownedBySet.get(`${gidStr}|${s.setCode}`) ?? { masterOwned: 0, gameOwned: 0 };
        return {
          setCode: s.setCode,
          masterOwned: o.masterOwned,
          masterTotal: s.masterTotal,
          gameOwned: o.gameOwned,
          gameTotal: s.gameTotal,
        };
      })
      .sort((a, b) => a.setCode.localeCompare(b.setCode));

    results.push({
      gameId: gidStr,
      name: meta?.name ?? gidStr,
      slug: meta?.slug,
      icon: meta?.icon,
      color: meta?.color,
      type: meta?.type ?? "Other",
      copies: owned.copies,
      masterOwned: owned.masterOwned,
      masterTotal: universe.masterTotal,
      gameOwned: owned.gameOwned,
      gameTotal: universe.gameTotal,
      sets,
    });
  }

  return results;
}

/**
 * Full collection overview across games.
 * By default only games the user owns items in are returned; pass includeEmpty
 * to also include every game that has a catalog (shown at 0%).
 */
export async function getCollectionOverview(
  owner: CollectionOwner,
  { includeEmpty = false }: { includeEmpty?: boolean } = {}
): Promise<CollectionOverview> {
  // Distinct games the owner owns items in.
  const ownedGameRows = await db
    .collection("collection-cards")
    .aggregate<{ _id: ObjectId }>([
      { $match: ownerMatch(owner) },
      { $lookup: { from: "cards", localField: "cardId", foreignField: "id", as: "c" } },
      { $addFields: { c: { $arrayElemAt: ["$c", 0] } } },
      { $match: { c: { $ne: null } } },
      { $group: { _id: "$c.gameId" } },
    ])
    .toArray();
  const ownedGameIds = ownedGameRows.map((r) => r._id);

  let gameIds = ownedGameIds;
  if (includeEmpty) {
    const allGameIds = (await db.collection("cards").distinct("gameId")) as ObjectId[];
    gameIds = allGameIds;
  }

  const games = await getGamesStats(owner, gameIds);

  // Show games with the most owned first, then the biggest catalogs.
  games.sort((a, b) => b.copies - a.copies || b.masterTotal - a.masterTotal || a.name.localeCompare(b.name));

  const overview: CollectionOverview = {
    totalCopies: 0,
    masterOwned: 0,
    masterTotal: 0,
    gameOwned: 0,
    gameTotal: 0,
    gamesWithItems: 0,
    games,
  };
  for (const g of games) {
    overview.totalCopies += g.copies;
    overview.masterOwned += g.masterOwned;
    overview.masterTotal += g.masterTotal;
    overview.gameOwned += g.gameOwned;
    overview.gameTotal += g.gameTotal;
    if (g.copies > 0) overview.gamesWithItems += 1;
  }

  return overview;
}

export type CollectionItem = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  quantity: number;
  /** Number of *other* printings of this same card name the user owns at least one copy of. */
  variantsOwned: number;
};

export type GameCollectionResult = {
  items: CollectionItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  setCodes: string[];
  types: string[];
  stats: GameCollectionStats | null;
};

/**
 * For a batch of catalog items, count how many *other* printings sharing the same
 * card name the user owns at least one copy of. Ownership is matched directly on
 * `collection-cards` (name + setCode + collectorNumber, all denormalized on that
 * collection at write time) rather than joining through `cards.id`, since that id
 * is not strictly unique (see module-level note on `getGamesStats`).
 */
async function getVariantsOwnedByKey(
  owner: CollectionOwner,
  gameObjId: ObjectId,
  items: { name: string; setCode: string; collectorNumber: string }[]
): Promise<Map<string, number>> {
  const names = [...new Set(items.map((it) => it.name))];
  if (names.length === 0) return new Map();

  const [catalogPrintings, ownedGroups] = await Promise.all([
    db
      .collection("cards")
      .find(
        { gameId: gameObjId, name: { $in: names } },
        { projection: { _id: 0, name: 1, setCode: 1, collectorNumber: 1 } }
      )
      .toArray(),
    db
      .collection("collection-cards")
      .aggregate<{ _id: { name: string; setCode: string; collectorNumber: string } }>([
        { $match: { ...ownerMatch(owner), name: { $in: names } } },
        { $group: { _id: { name: "$name", setCode: "$setCode", collectorNumber: "$collectorNumber" } } },
      ])
      .toArray(),
  ]);

  const ownedKeys = new Set(
    ownedGroups.map((g) => `${g._id.name}|${g._id.setCode}|${g._id.collectorNumber}`)
  );

  const printingsByName = new Map<string, { setCode: string; collectorNumber: string }[]>();
  for (const p of catalogPrintings) {
    const key = p.name as string;
    const list = printingsByName.get(key) ?? [];
    list.push({ setCode: p.setCode as string, collectorNumber: String(p.collectorNumber ?? "") });
    printingsByName.set(key, list);
  }

  const result = new Map<string, number>();
  for (const it of items) {
    const printings = printingsByName.get(it.name) ?? [];
    const count = printings.filter((p) => {
      const isSelf = p.setCode === it.setCode && p.collectorNumber === it.collectorNumber;
      return !isSelf && ownedKeys.has(`${it.name}|${p.setCode}|${p.collectorNumber}`);
    }).length;
    result.set(`${it.name}|${it.setCode}|${it.collectorNumber}`, count);
  }

  return result;
}

/**
 * Paginated catalog for a single game, each item annotated with the quantity
 * the user owns. Supports set / type / search filtering and an owned-only mode.
 */
export async function getGameCollection({
  owner,
  gameId,
  setCode,
  type,
  search,
  owned,
  page = 1,
  limit = 48,
}: {
  owner: CollectionOwner;
  gameId: string;
  setCode?: string;
  type?: string;
  search?: string;
  /** true = owned only, false = not-owned only, undefined = all */
  owned?: boolean;
  page?: number;
  limit?: number;
}): Promise<GameCollectionResult> {
  const gameObjId = new ObjectId(gameId);
  const ownerFieldName = ownerField(owner);
  const ownerObjId = new ObjectId(owner.id);

  const match: Record<string, unknown> = { gameId: gameObjId };
  if (setCode && setCode !== "all") match.setCode = setCode;
  if (type && type !== "all") match.type = type;
  if (search && search.trim()) match.name = { $regex: escapeRegex(search.trim()), $options: "i" };

  const ownedLookup: Record<string, unknown>[] = [
    {
      $lookup: {
        from: "collection-cards",
        let: { cid: "$id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$cardId", "$$cid"] }, { $eq: [`$${ownerFieldName}`, ownerObjId] }] } } },
          { $count: "n" },
        ],
        as: "owned",
      },
    },
    { $addFields: { quantity: { $ifNull: [{ $arrayElemAt: ["$owned.n", 0] }, 0] } } },
  ];
  const sortSkipLimit: Record<string, unknown>[] = [
    { $sort: { setCode: 1, collectorNumber: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ];
  const project = {
    $project: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1, type: 1, quantity: 1 },
  };

  const cards = db.collection("cards");

  let countPipeline: Record<string, unknown>[];
  let itemsPipeline: Record<string, unknown>[];
  if (owned !== undefined) {
    // Ownership is only known after the lookup, so it must precede pagination.
    const filtered = [
      { $match: match },
      ...ownedLookup,
      { $match: { quantity: owned ? { $gt: 0 } : { $eq: 0 } } },
    ];
    countPipeline = [...filtered, { $count: "total" }];
    itemsPipeline = [...filtered, ...sortSkipLimit, project];
  } else {
    // Paginate first, then only resolve quantities for the page being returned.
    countPipeline = [{ $match: match }, { $count: "total" }];
    itemsPipeline = [{ $match: match }, ...sortSkipLimit, ...ownedLookup, project];
  }

  const countRes = await cards.aggregate(countPipeline).toArray();
  const total = countRes.length > 0 ? (countRes[0].total as number) : 0;

  const rawItems = (await cards.aggregate(itemsPipeline).toArray()).map((c) => ({
    ...c,
    collectorNumber: String(c.collectorNumber ?? ""),
  })) as Omit<CollectionItem, "variantsOwned">[];

  const variantsOwnedByKey = await getVariantsOwnedByKey(owner, gameObjId, rawItems);
  const items: CollectionItem[] = rawItems.map((it) => ({
    ...it,
    variantsOwned: variantsOwnedByKey.get(`${it.name}|${it.setCode}|${it.collectorNumber}`) ?? 0,
  }));

  const setCodes = ((await cards.distinct("setCode", { gameId: gameObjId })) as unknown[])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  const types = ((await cards.distinct("type", { gameId: gameObjId })) as unknown[])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();

  const [stats] = await getGamesStats(owner, [gameObjId]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    setCodes,
    types,
    stats: stats ?? null,
  };
}

export type CardVariant = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  quantity: number;
};

/**
 * Every catalog printing sharing the given card name, each annotated with the
 * quantity the user owns of that specific printing (0 if none). Used to list
 * "variants" of a card (e.g. alt arts) in the collection modal.
 */
export async function getCardVariants({
  owner,
  gameId,
  name,
}: {
  owner: CollectionOwner;
  gameId: string;
  name: string;
}): Promise<CardVariant[]> {
  const gameObjId = new ObjectId(gameId);
  const ownerFieldName = ownerField(owner);
  const ownerObjId = new ObjectId(owner.id);

  const variants = await db
    .collection("cards")
    .aggregate([
      { $match: { gameId: gameObjId, name } },
      {
        $lookup: {
          from: "collection-cards",
          let: { setCode: "$setCode", collectorNumber: { $toString: "$collectorNumber" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [`$${ownerFieldName}`, ownerObjId] },
                    { $eq: ["$name", name] },
                    { $eq: ["$setCode", "$$setCode"] },
                    { $eq: ["$collectorNumber", "$$collectorNumber"] },
                  ],
                },
              },
            },
            { $count: "n" },
          ],
          as: "owned",
        },
      },
      { $addFields: { quantity: { $ifNull: [{ $arrayElemAt: ["$owned.n", 0] }, 0] } } },
      { $sort: { setCode: 1, collectorNumber: 1 } },
      { $project: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1, type: 1, quantity: 1 } },
    ])
    .toArray();

  return variants.map((v) => ({
    ...v,
    collectorNumber: String(v.collectorNumber ?? ""),
  })) as CardVariant[];
}
