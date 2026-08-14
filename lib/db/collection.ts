import 'server-only';
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { printingKey, type OwnershipSnapshot } from "@/lib/collection/ownership";
import type { CardPrinting } from "@/lib/types/card";
import type { CollectionEntryGroup } from "@/lib/collection/formats";
import { cardSearchFilter } from "@/lib/collection/search";
import {
  getOwnedProductGameIds,
  getProductGamesStats,
  type ProductCollectionStats,
} from "@/lib/db/products-collection";
import { getGameIdsWithProducts } from "@/lib/db/products";
import { getCardMarketPrices } from "@/lib/db/card-prices";
import type { CardMarketPrice } from "@/lib/prices/display";

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

/**
 * Les statistiques de produits vivent dans un tableau à part plutôt que dans un
 * champ optionnel de `GameCollectionStats` : ce type est lu par les écrans de
 * collection, ceux des groupes de jeu, l'app mobile et `openapi.yaml`, et tous
 * ses champs parlent de cartes. La fusion par jeu se fait dans la vue.
 *
 * `totalCopies` garde donc son sens — les exemplaires de **cartes**. Les
 * clients existants continuent de le lire sans surprise, et mêler figurines et
 * cartes dans un seul nombre n'aurait de toute façon aucun sens à l'écran.
 */
export type CollectionOverview = {
  totalCopies: number;
  masterOwned: number;
  masterTotal: number;
  gameOwned: number;
  gameTotal: number;
  gamesWithItems: number;
  games: GameCollectionStats[];
  /** Progression des jeux qui ont un catalogue de produits. */
  productGames: ProductCollectionStats[];
  totalProductCopies: number;
  productsOwned: number;
  productsTotal: number;
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

// Exportés : la collection de produits (`lib/db/products-collection.ts`) suit
// exactement la même convention de propriétaire, et la redéfinir de son côté
// laisserait deux vérités à tenir à jour.
export function ownerField(owner: CollectionOwner): "userId" | "playGroupId" {
  return owner.type === "user" ? "userId" : "playGroupId";
}

export function ownerMatch(owner: CollectionOwner): Record<string, ObjectId> {
  return { [ownerField(owner)]: new ObjectId(owner.id) };
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

/** Deux `ObjectId` égaux sont deux objets distincts : la clé de dédoublonnage est leur écriture. */
function dedupeObjectIds(ids: ObjectId[]): ObjectId[] {
  const seen = new Map<string, ObjectId>();
  for (const id of ids) {
    seen.set(id.toString(), id);
  }
  return [...seen.values()];
}

/**
 * Full collection overview across games.
 * By default only games the user owns items in are returned; pass includeEmpty
 * to also include every game that has a catalog (shown at 0%).
 */
export async function getCollectionOverview(
  owner: CollectionOwner,
  { includeEmpty = false, allowedGameIds = null }: { includeEmpty?: boolean; allowedGameIds?: string[] | null } = {}
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
  // Les jeux de figurines n'ont pas de cartes : sans cette seconde source, un
  // jeu dont on ne possède que des produits n'apparaîtrait jamais ici.
  const ownedProductGameIds = await getOwnedProductGameIds(owner);

  const ownedGameIds = dedupeObjectIds([...ownedGameRows.map((r) => r._id), ...ownedProductGameIds]);

  let gameIds = ownedGameIds;
  if (includeEmpty) {
    const [cardGameIds, productGameIds] = await Promise.all([
      db.collection("cards").distinct("gameId") as Promise<ObjectId[]>,
      getGameIdsWithProducts(),
    ]);
    gameIds = dedupeObjectIds([...cardGameIds, ...productGameIds]);
  }

  if (allowedGameIds) {
    const allowedSet = new Set(allowedGameIds);
    gameIds = gameIds.filter((gameId) => allowedSet.has(gameId.toString()));
  }

  const [games, productGames] = await Promise.all([
    getGamesStats(owner, gameIds),
    getProductGamesStats(owner, gameIds),
  ]);

  // Show games with the most owned first, then the biggest catalogs.
  games.sort((a, b) => b.copies - a.copies || b.masterTotal - a.masterTotal || a.name.localeCompare(b.name));
  productGames.sort(
    (a, b) => b.copies - a.copies || b.productsTotal - a.productsTotal || a.name.localeCompare(b.name)
  );

  const overview: CollectionOverview = {
    totalCopies: 0,
    masterOwned: 0,
    masterTotal: 0,
    gameOwned: 0,
    gameTotal: 0,
    gamesWithItems: 0,
    games,
    productGames,
    totalProductCopies: 0,
    productsOwned: 0,
    productsTotal: 0,
  };
  // Un jeu qui a des cartes **et** des produits ne doit être compté qu'une fois
  // dans le nombre de jeux entamés.
  const gamesWithItems = new Set<string>();

  for (const g of games) {
    overview.totalCopies += g.copies;
    overview.masterOwned += g.masterOwned;
    overview.masterTotal += g.masterTotal;
    overview.gameOwned += g.gameOwned;
    overview.gameTotal += g.gameTotal;
    if (g.copies > 0) gamesWithItems.add(g.gameId);
  }

  for (const g of productGames) {
    overview.totalProductCopies += g.copies;
    overview.productsOwned += g.productsOwned;
    overview.productsTotal += g.productsTotal;
    if (g.copies > 0) gamesWithItems.add(g.gameId);
  }

  overview.gamesWithItems = gamesWithItems.size;

  return overview;
}

export type CollectionItem = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  /** Carte qui n'existe qu'en foil. */
  foil?: boolean;
  /** Variantes d'impression, proposées au moment d'ajouter un exemplaire. */
  printings?: CardPrinting[];
  quantity: number;
  /** Number of *other* printings of this same card name the user owns at least one copy of. */
  variantsOwned: number;
  /** Prix de marché de la carte, absent tant qu'aucun relevé ne la couvre. */
  marketPrice?: CardMarketPrice;
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
 * Le catalogue porte **une ligne par langue** : une carte importée en deux
 * langues y figure deux fois, avec le même numéro de collection et le même
 * identifiant. Or un item de collection est un tirage, la langue n'étant qu'un
 * attribut d'exemplaire (voir la note en tête de module) — sans ce
 * regroupement, la carte apparaît en double dans la liste et compte double
 * dans les résultats. Les dénominateurs de complétion le font déjà.
 *
 * La clé de regroupement ramène le numéro à une chaîne : le catalogue en stocke
 * certains sous forme de nombre, qui formeraient sinon une clé distincte de
 * leur jumeau textuel. Le champ conservé reste en revanche la valeur d'origine,
 * pour que le tri qui suit ordonne comme avant — trier des numéros nus sur leur
 * écriture donnerait 1, 10, 100, 2.
 *
 * Aucun tri ne précède le regroupement : la ligne retenue est celle que le
 * parcours rencontre en premier, comme pour le calcul de complétion.
 */
const dedupePrintings: Record<string, unknown>[] = [
  {
    $group: {
      _id: { setCode: "$setCode", collectorNumber: { $toString: "$collectorNumber" } },
      id: { $first: "$id" },
      name: { $first: "$name" },
      setCode: { $first: "$setCode" },
      collectorNumber: { $first: "$collectorNumber" },
      image: { $first: "$image" },
      type: { $first: "$type" },
      foil: { $first: "$foil" },
      printings: { $first: "$printings" },
    },
  },
];

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
  // Nom, numéro de collection ou identifiant, sans se soucier des accents :
  // voir `lib/collection/search.ts`.
  Object.assign(match, cardSearchFilter(search) ?? {});

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
    $project: {
      _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1, type: 1, foil: 1, printings: 1, quantity: 1,
    },
  };

  const cards = db.collection("cards");

  let countPipeline: Record<string, unknown>[];
  let itemsPipeline: Record<string, unknown>[];
  if (owned !== undefined) {
    // Ownership is only known after the lookup, so it must precede pagination.
    const filtered = [
      { $match: match },
      ...dedupePrintings,
      ...ownedLookup,
      { $match: { quantity: owned ? { $gt: 0 } : { $eq: 0 } } },
    ];
    countPipeline = [...filtered, { $count: "total" }];
    itemsPipeline = [...filtered, ...sortSkipLimit, project];
  } else {
    // Paginate first, then only resolve quantities for the page being returned.
    countPipeline = [{ $match: match }, ...dedupePrintings, { $count: "total" }];
    itemsPipeline = [{ $match: match }, ...dedupePrintings, ...sortSkipLimit, ...ownedLookup, project];
  }

  const countRes = await cards.aggregate(countPipeline).toArray();
  const total = countRes.length > 0 ? (countRes[0].total as number) : 0;

  const rawItems = (await cards.aggregate(itemsPipeline).toArray()).map((c) => ({
    ...c,
    collectorNumber: String(c.collectorNumber ?? ""),
  })) as Omit<CollectionItem, "variantsOwned">[];

  const [variantsOwnedByKey, marketPrices] = await Promise.all([
    getVariantsOwnedByKey(owner, gameObjId, rawItems),
    getCardMarketPrices(gameObjId, rawItems.map((it) => it.id)),
  ]);
  const items: CollectionItem[] = rawItems.map((it) => ({
    ...it,
    variantsOwned: variantsOwnedByKey.get(`${it.name}|${it.setCode}|${it.collectorNumber}`) ?? 0,
    ...(marketPrices.get(it.id) ? { marketPrice: marketPrices.get(it.id) } : {}),
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
      // Sans quoi une carte présente en plusieurs langues se compterait autant
      // de fois parmi ses propres variantes.
      ...dedupePrintings,
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

/**
 * Exemplaires possédés pour une liste de noms de cartes, détaillés par
 * impression. Comme `getVariantsOwnedByKey`, la possession est lue directement
 * sur `collection-cards` (nom + extension + numéro y sont dénormalisés à
 * l'écriture) plutôt qu'en joignant `cards.id`, cet identifiant n'étant pas
 * strictement unique.
 *
 * Le catalogue du jeu délimite ce que « toutes variantes confondues » recouvre :
 * seules les impressions qu'il connaît sont comptées, ce qui évite qu'un
 * homonyme d'un autre jeu ne gonfle le total.
 */
export async function getOwnershipByName(
  owner: CollectionOwner,
  gameId: string,
  names: string[],
  { excludeBoosterId }: { excludeBoosterId?: string } = {}
): Promise<OwnershipSnapshot> {
  const uniqueNames = [...new Set(names)].filter(Boolean);
  if (uniqueNames.length === 0) return {};

  const match: Record<string, unknown> = { ...ownerMatch(owner), name: { $in: uniqueNames } };
  // Une fois le booster versé à la collection, ses cartes y comptent déjà.
  // L'appelant rajoutant le contenu du booster par-dessus, les compter ici
  // aussi les ferait apparaître en double.
  if (excludeBoosterId && ObjectId.isValid(excludeBoosterId)) {
    match.fromBoosterId = { $ne: new ObjectId(excludeBoosterId) };
  }

  const [catalogPrintings, ownedGroups] = await Promise.all([
    db
      .collection("cards")
      .find(
        { gameId: new ObjectId(gameId), name: { $in: uniqueNames } },
        { projection: { _id: 0, name: 1, setCode: 1, collectorNumber: 1 } }
      )
      .toArray(),
    db
      .collection("collection-cards")
      .aggregate<{ _id: { name: string; setCode: string; collectorNumber: string }; count: number }>([
        { $match: match },
        {
          // `collection-cards` porte des numéros de collection tantôt en
          // nombre, tantôt en chaîne : sans conversion, la clé groupée ne
          // correspondrait pas à celle construite depuis le catalogue.
          $group: {
            _id: {
              name: "$name",
              setCode: "$setCode",
              collectorNumber: { $toString: "$collectorNumber" },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const catalogKeys = new Set(
    catalogPrintings.map((p) => `${p.name}|${p.setCode}|${String(p.collectorNumber ?? "")}`)
  );

  const snapshot: OwnershipSnapshot = {};
  for (const group of ownedGroups) {
    const { name, setCode, collectorNumber } = group._id;
    if (!catalogKeys.has(`${name}|${setCode}|${collectorNumber}`)) continue;
    const entry = (snapshot[name] ??= { total: 0, printings: {} });
    const key = printingKey({ setCode, collectorNumber });
    entry.total += group.count;
    entry.printings[key] = (entry.printings[key] ?? 0) + group.count;
  }

  return snapshot;
}

export type OwnershipBreakdown = { owner: CollectionOwner; count: number };

/**
 * For a single catalog card id, counts copies owned by each of the given
 * owners (a mix of individual users and play-groups), e.g. to show "3 of
 * your friends own this card". Owners with zero copies are simply absent
 * from the result rather than returned with count 0.
 */
export async function getCardOwnershipByOwners(
  owners: CollectionOwner[],
  cardId: string
): Promise<OwnershipBreakdown[]> {
  const userIds = owners.filter((o) => o.type === "user").map((o) => new ObjectId(o.id));
  const playGroupIds = owners.filter((o) => o.type === "playGroup").map((o) => new ObjectId(o.id));

  const orClauses: Record<string, unknown>[] = [];
  if (userIds.length > 0) orClauses.push({ userId: { $in: userIds } });
  if (playGroupIds.length > 0) orClauses.push({ playGroupId: { $in: playGroupIds } });
  if (orClauses.length === 0) return [];

  const rows = await db
    .collection("collection-cards")
    .aggregate<{ _id: { userId?: ObjectId; playGroupId?: ObjectId }; count: number }>([
      { $match: { cardId, $or: orClauses } },
      { $group: { _id: { userId: "$userId", playGroupId: "$playGroupId" }, count: { $sum: 1 } } },
    ])
    .toArray();

  return rows.map((row) => ({
    owner: row._id.userId
      ? { type: "user" as const, id: row._id.userId.toString() }
      : { type: "playGroup" as const, id: row._id.playGroupId!.toString() },
    count: row.count,
  }));
}

/**
 * La collection, prête à être exportée : un lot par ensemble d'exemplaires
 * identiques, avec sa quantité.
 *
 * Le stockage est d'un document par exemplaire, ce qui donnerait un fichier de
 * plusieurs milliers de lignes pour une collection ordinaire. Le regroupement
 * porte sur tout ce qui distingue deux exemplaires (variante, foil, langue,
 * état, note, provenance) : deux cartes réunies ici sont bien interchangeables.
 */
export async function getCollectionEntriesForExport(
  owner: CollectionOwner,
  gameId: string
): Promise<CollectionEntryGroup[]> {
  const rows = await db
    .collection("collection-cards")
    .aggregate<{
      _id: {
        cardId: string;
        foil: boolean;
        printingId?: string;
        language?: string;
        condition?: string;
        grade?: number;
        obtainedAt?: string;
        acquisitionPrice?: number;
        acquisitionCurrency?: string;
      };
      quantity: number;
      name: string;
      setCode: string;
      collectorNumber: unknown;
      rarity?: string;
      printingName?: string;
    }>([
      { $match: ownerMatch(owner) },
      { $lookup: { from: "cards", localField: "cardId", foreignField: "id", as: "c" } },
      // Même précaution que `getGamesStats` : `cards.id` n'est pas strictement
      // unique, on ne garde qu'une correspondance pour ne pas dupliquer un
      // exemplaire au passage.
      { $addFields: { c: { $arrayElemAt: ["$c", 0] } } },
      { $match: { "c.gameId": new ObjectId(gameId) } },
      {
        $group: {
          _id: {
            cardId: "$cardId",
            foil: { $ifNull: ["$foil", false] },
            printingId: "$printingId",
            language: "$language",
            condition: "$condition",
            grade: "$grade",
            obtainedAt: "$obtainedAt",
            acquisitionPrice: "$acquisitionPrice",
            acquisitionCurrency: "$acquisitionCurrency",
          },
          quantity: { $sum: 1 },
          name: { $first: "$c.name" },
          setCode: { $first: "$c.setCode" },
          collectorNumber: { $first: "$c.collectorNumber" },
          rarity: { $first: "$c.rarity" },
          printingName: { $first: "$printingName" },
        },
      },
      { $sort: { setCode: 1, collectorNumber: 1, "_id.foil": 1, "_id.printingId": 1 } },
    ])
    .toArray();

  return rows.map((row) => ({
    cardId: row._id.cardId,
    name: row.name,
    setCode: row.setCode,
    collectorNumber: String(row.collectorNumber ?? ""),
    ...(row.rarity !== undefined && { rarity: row.rarity }),
    foil: row._id.foil === true,
    ...(row._id.printingId !== undefined && { printingId: row._id.printingId }),
    ...(row.printingName !== undefined && { printingName: row.printingName }),
    ...(row._id.language !== undefined && { language: row._id.language as CollectionEntryGroup["language"] }),
    ...(row._id.condition !== undefined && { condition: row._id.condition as CollectionEntryGroup["condition"] }),
    ...(row._id.grade !== undefined && { grade: row._id.grade }),
    ...(row._id.obtainedAt !== undefined && { obtainedAt: row._id.obtainedAt }),
    ...(row._id.acquisitionPrice !== undefined && { acquisitionPrice: row._id.acquisitionPrice }),
    ...(row._id.acquisitionCurrency !== undefined && {
      acquisitionCurrency: row._id.acquisitionCurrency as CollectionEntryGroup["acquisitionCurrency"],
    }),
    quantity: row.quantity,
  }));
}
