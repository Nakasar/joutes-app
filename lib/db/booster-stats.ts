import 'server-only';
import db from "@/lib/mongodb";
import {ObjectId} from "bson";
import {normalizeBoosterType, OTHER_BOOSTER_TYPE} from "@/lib/constants/booster-types";

export type RarityCount = {
  rarity: string;
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
  /** Cartes du groupe dont la rareté est connue : dénominateur des parts. */
  knownCards: number;
  cardsWithoutRarity: number;
  /** Cartes du groupe par rareté, de la plus fréquente à la plus rare. */
  rarities: RarityCount[];
};

export type BoosterStats = {
  boosters: number;
  cards: number;
  cardsPerBooster: number;
  foils: number;
  /** Cartes dont la rareté est connue : dénominateur des parts. */
  knownCards: number;
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
  boosters: number;
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

/**
 * Comptage d'un regroupement : on dédoublonne d'abord par booster (une ligne
 * par carte en entrée), puis on agrège par clé. Compter les boosters par
 * `$addToSet` des identifiants ferait grossir le document du `$facet` avec le
 * nombre de boosters, jusqu'à sa limite de 16 Mo.
 */
function groupStages(key: string) {
  return [
    {$group: {_id: {key, boosterId: '$_id'}, cards: {$sum: '$hasCard'}, foils: {$sum: '$foil'}}},
    {$group: {_id: '$_id.key', boosters: {$sum: 1}, cards: {$sum: '$cards'}, foils: {$sum: '$foils'}}},
  ];
}

function rarityStages(key: string) {
  return [
    {$match: {hasCard: 1}},
    {$group: {_id: {key, rarity: {$ifNull: ['$rarity', null]}}, cards: {$sum: 1}}},
  ];
}

function toGroups(
  groups: FacetGroup[],
  rarities: FacetRarity[],
  normalizeKey: (key: string | null) => string
): BoosterGroupStats[] {
  const rarityByKey = new Map<string, FacetRarity[]>();
  for (const row of rarities) {
    const key = normalizeKey(row._id.key);
    rarityByKey.set(key, [...(rarityByKey.get(key) ?? []), row]);
  }

  return groups
    .map((group) => {
      const key = normalizeKey(group._id);
      const rows = rarityByKey.get(key) ?? [];
      const cardsWithoutRarity = rows.filter((row) => row._id.rarity === null).reduce((sum, row) => sum + row.cards, 0);

      return {
        key,
        boosters: group.boosters,
        cards: group.cards,
        cardsPerBooster: group.boosters > 0 ? group.cards / group.boosters : 0,
        foils: group.foils,
        knownCards: group.cards - cardsWithoutRarity,
        cardsWithoutRarity,
        rarities: rows
          .filter((row): row is FacetRarity & { _id: { key: string | null; rarity: string } } => row._id.rarity !== null)
          .map((row) => ({rarity: row._id.rarity, cards: row.cards}))
          .sort((a, b) => b.cards - a.cards),
      };
    })
    .sort((a, b) => b.boosters - a.boosters || a.key.localeCompare(b.key));
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
    totals: { boosters: number; cards: number; foils: number }[];
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
        // Le type est normalisé ici : les boosters historiques (`custom` ou sans
        // type) tombent dans le même groupe que les « Autre ».
        typeKey: {
          $let: {
            vars: {type: {$ifNull: ['$type', OTHER_BOOSTER_TYPE]}},
            in: {$cond: [{$in: ['$$type', ['custom', '']]}, OTHER_BOOSTER_TYPE, '$$type']},
          },
        },
        setCode: 1,
        hasCard: {$cond: [{$ifNull: ['$card', false]}, 1, 0]},
        foil: {$cond: [{$eq: ['$card.foil', true]}, 1, 0]},
        rarity: {$arrayElemAt: ['$cardDoc.rarity', 0]},
      },
    },
    {
      $facet: {
        totals: [
          {$group: {_id: '$_id', cards: {$sum: '$hasCard'}, foils: {$sum: '$foil'}}},
          {$group: {_id: null, boosters: {$sum: 1}, cards: {$sum: '$cards'}, foils: {$sum: '$foils'}}},
        ],
        overall: [
          {$match: {hasCard: 1}},
          {$group: {_id: {$ifNull: ['$rarity', null]}, cards: {$sum: 1}}},
        ],
        byType: groupStages('$typeKey'),
        bySet: groupStages('$setCode'),
        rarityByType: rarityStages('$typeKey'),
        rarityBySet: rarityStages('$setCode'),
      },
    },
  ]).toArray();

  const totals = result?.totals?.[0];
  const boosters = totals?.boosters ?? 0;
  const cards = totals?.cards ?? 0;

  const overall = (result?.overall ?? []).sort((a, b) => b.cards - a.cards);
  const cardsWithoutRarity = overall.find((row) => row._id === null)?.cards ?? 0;
  const knownRarities = overall
    .filter((row): row is { _id: string; cards: number } => row._id !== null)
    .map((row) => ({rarity: row._id, cards: row.cards}));

  return {
    boosters,
    cards,
    cardsPerBooster: boosters > 0 ? cards / boosters : 0,
    foils: totals?.foils ?? 0,
    knownCards: cards - cardsWithoutRarity,
    cardsWithoutRarity,
    // De la rareté la plus fréquente à la plus rare : l'ordre « officiel » des
    // raretés dépend du jeu et n'est décrit nulle part en base.
    rarities: knownRarities.map((row) => row.rarity),
    overall: knownRarities,
    byType: toGroups(result?.byType ?? [], result?.rarityByType ?? [], (key) =>
      normalizeBoosterType(typeof key === 'string' ? key : undefined)
    ),
    bySet: toGroups(result?.bySet ?? [], result?.rarityBySet ?? [], (key) => (typeof key === 'string' && key ? key : '—')),
  };
}
