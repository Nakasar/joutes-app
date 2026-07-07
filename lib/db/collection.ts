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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compute per-game / per-set completion stats for the given games.
 * Games with no catalog data are skipped.
 */
export async function getGamesStats(
  userId: string,
  gameIds: ObjectId[]
): Promise<GameCollectionStats[]> {
  if (gameIds.length === 0) {
    return [];
  }

  const userObjId = new ObjectId(userId);

  // --- Owned stats (from the user's individual copies, joined to the catalog) ---
  const [ownedFacet] = await db
    .collection("collection-cards")
    .aggregate<{
      bySet: { _id: { gameId: ObjectId; setCode: string } } & FacetCount[][0];
      byGame: { _id: ObjectId } & FacetCount;
    }>([
      { $match: { userId: userObjId } },
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
  userId: string,
  { includeEmpty = false }: { includeEmpty?: boolean } = {}
): Promise<CollectionOverview> {
  const userObjId = new ObjectId(userId);

  // Distinct games the user owns items in.
  const ownedGameRows = await db
    .collection("collection-cards")
    .aggregate<{ _id: ObjectId }>([
      { $match: { userId: userObjId } },
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

  const games = await getGamesStats(userId, gameIds);

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
 * Paginated catalog for a single game, each item annotated with the quantity
 * the user owns. Supports set / type / search filtering and an owned-only mode.
 */
export async function getGameCollection({
  userId,
  gameId,
  setCode,
  type,
  search,
  ownedOnly = false,
  page = 1,
  limit = 48,
}: {
  userId: string;
  gameId: string;
  setCode?: string;
  type?: string;
  search?: string;
  ownedOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<GameCollectionResult> {
  const userObjId = new ObjectId(userId);
  const gameObjId = new ObjectId(gameId);

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
          { $match: { $expr: { $and: [{ $eq: ["$cardId", "$$cid"] }, { $eq: ["$userId", userObjId] }] } } },
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
  if (ownedOnly) {
    // Ownership is only known after the lookup, so it must precede pagination.
    const owned = [{ $match: match }, ...ownedLookup, { $match: { quantity: { $gt: 0 } } }];
    countPipeline = [...owned, { $count: "total" }];
    itemsPipeline = [...owned, ...sortSkipLimit, project];
  } else {
    // Paginate first, then only resolve quantities for the page being returned.
    countPipeline = [{ $match: match }, { $count: "total" }];
    itemsPipeline = [{ $match: match }, ...sortSkipLimit, ...ownedLookup, project];
  }

  const countRes = await cards.aggregate(countPipeline).toArray();
  const total = countRes.length > 0 ? (countRes[0].total as number) : 0;

  const items = (await cards.aggregate(itemsPipeline).toArray()).map((c) => ({
    ...c,
    collectorNumber: String(c.collectorNumber ?? ""),
  })) as CollectionItem[];

  const setCodes = ((await cards.distinct("setCode", { gameId: gameObjId })) as unknown[])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  const types = ((await cards.distinct("type", { gameId: gameObjId })) as unknown[])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();

  const [stats] = await getGamesStats(userId, [gameObjId]);

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
