import 'server-only';
import db from "@/lib/mongodb";
import {ObjectId} from "bson";
import {normalizeBoosterType} from "@/lib/constants/booster-types";

export type RarityCount = {
  rarity: string | null;
  cards: number;
};

export type BoosterGroupStats = {
  /** Type de booster normalisé, ou code d'extension, selon le regroupement. */
  key: string;
  boosters: number;
  cards: number;
  /** Nombre moyen de cartes par booster du groupe. */
  cardsPerBooster: number;
  foils: number;
  /** Cartes du groupe par rareté ; `null` = rareté inconnue (carte absente de `cards`). */
  rarities: RarityCount[];
};

export type BoosterStats = {
  boosters: number;
  cards: number;
  cardsPerBooster: number;
  foils: number;
  /** Cartes dont la rareté n'a pas pu être retrouvée : elles ne comptent pas dans les taux. */
  cardsWithoutRarity: number;
  /** Raretés rencontrées, de la plus fréquente à la plus rare. */
  rarities: string[];
  overall: RarityCount[];
  byType: BoosterGroupStats[];
  bySet: BoosterGroupStats[];
};

type FacetGroup = {
  _id: string | null;
  boosters: unknown[];
  cards: number;
  foils: number;
};

type FacetRarity = {
  _id: { key: string | null; rarity: string | null };
  cards: number;
};

/**
 * La rareté n'est pas stockée sur les entrées de `booster-cards`, qui ne
 * portent que l'identité d'une carte : elle est relue depuis `cards`, par
 * `cardId` sinon par extension + numéro de collection, comme à l'affichage
 * d'un booster.
 */
const RARITY_LOOKUP = {
  $lookup: {
    from: 'cards',
    let: {
      gameId: '$gameId',
      cardId: '$card.cardId',
      setCode: '$card.setCode',
      collectorNumber: '$card.collectorNumber',
    },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              {$eq: ['$gameId', '$$gameId']},
              {
                $or: [
                  {$and: [{$ne: ['$$cardId', null]}, {$eq: ['$id', '$$cardId']}]},
                  {
                    $and: [
                      // Les tests de nullité évitent qu'une entrée sans identité
                      // et une carte sans extension se rapprochent par leurs
                      // champs absents.
                      {$ne: ['$$setCode', null]},
                      {$ne: ['$$collectorNumber', null]},
                      {$eq: ['$setCode', '$$setCode']},
                      {$eq: ['$collectorNumber', '$$collectorNumber']},
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {$project: {_id: 0, rarity: 1}},
      {$limit: 1},
    ],
    as: 'cardDoc',
  },
};

function toGroups(
  groups: FacetGroup[],
  rarities: FacetRarity[],
  normalizeKey: (key: string | null) => string
): BoosterGroupStats[] {
  const byKey = new Map<string, BoosterGroupStats>();
  const boosterIds = new Map<string, Set<string>>();

  for (const group of groups) {
    const key = normalizeKey(group._id);
    const existing = byKey.get(key) ?? {key, boosters: 0, cards: 0, cardsPerBooster: 0, foils: 0, rarities: []};
    // Deux valeurs stockées peuvent se ramener au même groupe (`custom` et
    // `other`) : les boosters sont dédupliqués avant d'être comptés.
    const ids = boosterIds.get(key) ?? new Set<string>();
    for (const id of group.boosters) {
      ids.add(String(id));
    }
    boosterIds.set(key, ids);

    existing.cards += group.cards;
    existing.foils += group.foils;
    byKey.set(key, existing);
  }

  const rarityByKey = new Map<string, Map<string | null, number>>();
  for (const row of rarities) {
    const key = normalizeKey(row._id.key);
    const counts = rarityByKey.get(key) ?? new Map<string | null, number>();
    counts.set(row._id.rarity, (counts.get(row._id.rarity) ?? 0) + row.cards);
    rarityByKey.set(key, counts);
  }

  for (const [key, group] of byKey) {
    group.boosters = boosterIds.get(key)?.size ?? 0;
    group.cardsPerBooster = group.boosters > 0 ? group.cards / group.boosters : 0;
    group.rarities = [...(rarityByKey.get(key) ?? new Map())]
      .map(([rarity, cards]) => ({rarity, cards}))
      .sort((a, b) => b.cards - a.cards);
  }

  return [...byKey.values()].sort((a, b) => b.boosters - a.boosters || a.key.localeCompare(b.key));
}

/**
 * Statistiques sur les boosters d'un utilisateur pour un jeu : volumes et
 * distribution des raretés, par type de booster et par extension. Les boosters
 * vides sont comptés (ils font partie du dénominateur des taux de drop), et les
 * cartes dont la rareté est inconnue sont signalées à part plutôt que fondues
 * dans les pourcentages.
 */
export async function getBoosterStats({userId, gameId}: {
  userId: string;
  gameId: string;
}): Promise<BoosterStats> {
  const [result] = await db.collection('boosters').aggregate<{
    byType: FacetGroup[];
    bySet: FacetGroup[];
    rarityByType: FacetRarity[];
    rarityBySet: FacetRarity[];
    totals: { boosters: unknown[]; cards: number; foils: number }[];
    overall: { _id: string | null; cards: number }[];
  }>([
    {$match: {userId: new ObjectId(userId), gameId: new ObjectId(gameId)}},
    {
      $lookup: {
        from: 'booster-cards',
        localField: '_id',
        foreignField: 'boosterId',
        as: 'cards',
        pipeline: [{$project: {_id: 0, cardId: 1, setCode: 1, collectorNumber: 1, foil: 1}}],
      },
    },
    // Les boosters vides restent dans le lot : ils comptent dans le nombre de
    // boosters ouverts, donc dans les moyennes par booster.
    {$unwind: {path: '$cards', preserveNullAndEmptyArrays: true}},
    {$project: {_id: 1, gameId: 1, type: 1, setCode: 1, card: '$cards'}},
    RARITY_LOOKUP,
    {
      $project: {
        _id: 1,
        type: 1,
        setCode: 1,
        hasCard: {$cond: [{$ifNull: ['$card', false]}, 1, 0]},
        foil: {$cond: [{$eq: ['$card.foil', true]}, 1, 0]},
        rarity: {$arrayElemAt: ['$cardDoc.rarity', 0]},
      },
    },
    {
      $facet: {
        totals: [
          {$group: {_id: null, boosters: {$addToSet: '$_id'}, cards: {$sum: '$hasCard'}, foils: {$sum: '$foil'}}},
        ],
        overall: [
          {$match: {hasCard: 1}},
          {$group: {_id: {$ifNull: ['$rarity', null]}, cards: {$sum: 1}}},
        ],
        byType: [
          {$group: {_id: '$type', boosters: {$addToSet: '$_id'}, cards: {$sum: '$hasCard'}, foils: {$sum: '$foil'}}},
        ],
        bySet: [
          {$group: {_id: '$setCode', boosters: {$addToSet: '$_id'}, cards: {$sum: '$hasCard'}, foils: {$sum: '$foil'}}},
        ],
        rarityByType: [
          {$match: {hasCard: 1}},
          {$group: {_id: {key: '$type', rarity: {$ifNull: ['$rarity', null]}}, cards: {$sum: 1}}},
        ],
        rarityBySet: [
          {$match: {hasCard: 1}},
          {$group: {_id: {key: '$setCode', rarity: {$ifNull: ['$rarity', null]}}, cards: {$sum: 1}}},
        ],
      },
    },
  ]).toArray();

  const totals = result?.totals?.[0];
  const boosters = totals?.boosters?.length ?? 0;
  const cards = totals?.cards ?? 0;

  const overall = (result?.overall ?? [])
    .map((row) => ({rarity: row._id, cards: row.cards}))
    .sort((a, b) => b.cards - a.cards);

  return {
    boosters,
    cards,
    cardsPerBooster: boosters > 0 ? cards / boosters : 0,
    foils: totals?.foils ?? 0,
    cardsWithoutRarity: overall.find((row) => row.rarity === null)?.cards ?? 0,
    // De la rareté la plus fréquente à la plus rare : l'ordre « officiel » des
    // raretés dépend du jeu et n'est décrit nulle part en base.
    rarities: overall.filter((row): row is {rarity: string; cards: number} => row.rarity !== null).map((row) => row.rarity),
    overall,
    byType: toGroups(result?.byType ?? [], result?.rarityByType ?? [], (key) =>
      normalizeBoosterType(typeof key === 'string' ? key : undefined)
    ),
    bySet: toGroups(result?.bySet ?? [], result?.rarityBySet ?? [], (key) => (typeof key === 'string' && key ? key : '—')),
  };
}
