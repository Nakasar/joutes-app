import 'server-only';
import db from "@/lib/mongodb";
import {Booster, BoosterCard, BoosterCardDb, BoosterDb, BoosterValue} from "@/lib/types/booster";
import {CARD_ATTRIBUTE_KEYS, CardAttributes} from "@/lib/types/card";
import {boosterTypeStoredValues, normalizeBoosterType, OTHER_BOOSTER_TYPE} from "@/lib/constants/booster-types";
import {ObjectId} from "bson";
import {removeSellListItemsByCollectionEntryIds} from "@/lib/db/sell-lists";
import {getCardsByIds} from "@/lib/db/cards";
import {getCardMarketPrices} from "@/lib/db/card-prices";
import {sumCardPrices} from "@/lib/prices/display";
import {CARDMARKET_CURRENCY} from "@/lib/prices/cardmarket";

type CardAttributesDoc = CardAttributes & { id?: string; setCode?: string; collectorNumber?: string };

const CARD_ATTRIBUTES_PROJECTION: Record<string, 0 | 1> = {
  _id: 0,
  id: 1,
  setCode: 1,
  collectorNumber: 1,
  ...Object.fromEntries(CARD_ATTRIBUTE_KEYS.map((key) => [key, 1])),
};

const printKey = (setCode?: string, collectorNumber?: string) => `${setCode ?? ''}#${collectorNumber ?? ''}`;

function pickCardAttributes(doc: CardAttributesDoc): CardAttributes {
  const attributes: Record<string, unknown> = {};
  for (const key of CARD_ATTRIBUTE_KEYS) {
    const value = doc[key];
    if (value !== undefined && value !== null) {
      attributes[key] = value;
    }
  }
  return attributes as CardAttributes;
}

/**
 * Les entrées de `booster-cards` ne stockent que l'identité d'une carte : les
 * propriétés de jeu (type, domaine, rareté…) et son prix de marché sont relus
 * depuis le catalogue à l'affichage. Cela couvre aussi les boosters saisis
 * avant l'ajout de ces propriétés, sans migration. Les cartes sans
 * correspondance sont renvoyées telles quelles.
 */
async function withCardAttributes(gameId: ObjectId, cards: BoosterCard[]): Promise<BoosterCard[]> {
  if (cards.length === 0) {
    return cards;
  }

  const cardIds = [...new Set(cards.map((card) => card.cardId).filter((id): id is string => Boolean(id)))];
  const prints = [
    ...new Map(
      cards
        .filter((card) => !card.cardId)
        .map((card) => [printKey(card.setCode, card.collectorNumber), {setCode: card.setCode, collectorNumber: card.collectorNumber}]),
    ).values(),
  ];

  const or: Record<string, unknown>[] = [];
  if (cardIds.length > 0) {
    or.push({id: {$in: cardIds}});
  }
  or.push(...prints);
  if (or.length === 0) {
    return cards;
  }

  const docs = await db
    .collection<CardAttributesDoc & { gameId: ObjectId }>('cards')
    .find({gameId, $or: or}, {projection: CARD_ATTRIBUTES_PROJECTION})
    .toArray();

  const byId = new Map<string, CardAttributes>();
  const byPrint = new Map<string, CardAttributes>();
  // Une entrée saisie avant que les cartes ne portent leur identifiant n'a que
  // son extension et son numéro : c'est le catalogue qui lui rend l'identifiant
  // sous lequel son prix est relevé.
  const catalogIdByPrint = new Map<string, string>();
  for (const doc of docs) {
    const attributes = pickCardAttributes(doc);
    if (doc.id && !byId.has(doc.id)) {
      byId.set(doc.id, attributes);
    }
    const key = printKey(doc.setCode, doc.collectorNumber);
    if (!byPrint.has(key)) {
      byPrint.set(key, attributes);
      if (doc.id) {
        catalogIdByPrint.set(key, doc.id);
      }
    }
  }

  const catalogId = (card: BoosterCard) => card.cardId ?? catalogIdByPrint.get(printKey(card.setCode, card.collectorNumber));
  const prices = await getCardMarketPrices(gameId, cards.flatMap((card) => catalogId(card) ?? []));

  return cards.map((card) => {
    const attributes = (card.cardId ? byId.get(card.cardId) : undefined) ?? byPrint.get(printKey(card.setCode, card.collectorNumber));
    const id = catalogId(card);
    const marketPrice = id ? prices.get(id) : undefined;
    // `cards` fait foi : les propriétés relues écrasent celles éventuellement
    // stockées sur l'entrée `booster-cards` (boosters saisis avant migration).
    return {...card, ...attributes, ...(marketPrice ? {marketPrice} : {})};
  });
}

function toBoosterValue(value: BoosterDb['estimatedValue']): BoosterValue | undefined {
  return value ? {...value, computedAt: value.computedAt.toISOString()} : undefined;
}

export async function createBooster(booster: Omit<Booster, 'id' | 'createdAt'>): Promise<Booster> {
  const result = await db.collection<BoosterDb>('boosters').insertOne({
    gameId: new ObjectId(booster.gameId),
    userId: new ObjectId(booster.userId),
    setCode: booster.setCode,
    lang: booster.lang,
    type: booster.type,
    price: booster.value,
    archived: booster.archived,
    createdAt: new Date(),
  });

  return {
    ...booster,
    id: result.insertedId.toString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Modification des détails d'un booster. Seuls les champs fournis sont touchés :
 * une note à `null` est effacée du document plutôt que stockée vide, pour que
 * les boosters sans note restent tous équivalents.
 */
export async function updateBooster(boosterId: string, details: { type?: string; note?: string | null }): Promise<void> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  if (details.type !== undefined) {
    set.type = details.type;
  }
  if (details.note !== undefined) {
    if (details.note === null) {
      unset.note = '';
    } else {
      set.note = details.note;
    }
  }

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return;
  }

  await db.collection<BoosterDb>('boosters').updateOne(
    {_id: new ObjectId(boosterId)},
    {
      ...(Object.keys(set).length > 0 ? {$set: set} : {}),
      ...(Object.keys(unset).length > 0 ? {$unset: unset} : {}),
    },
  );
}

/**
 * Carte recherchée dans le contenu des boosters. L'impression (extension +
 * numéro) accompagne l'identifiant car les entrées `booster-cards` saisies
 * avant l'ajout de `cardId` n'en portent pas : sans elle, ces boosters
 * resteraient introuvables.
 */
export type BoosterCardFilter = {
  cardId: string;
  setCode?: string;
  collectorNumber?: string;
};

export type BoosterFilters = {
  userId?: string;
  gameId?: string;
  /** Type affiché (`other` couvre aussi le `custom` historique). */
  type?: string;
  /** Cartes que le booster doit **toutes** contenir. */
  cards?: BoosterCardFilter[];
};

export type BoosterSort = 'newest' | 'oldest';

/**
 * Identifiants des boosters contenant toutes les cartes demandées. Une requête
 * par carte puis intersection : `$all` ne s'applique pas ici, les cartes vivant
 * dans une collection séparée et non dans un tableau du booster.
 */
async function boosterIdsContainingCards(userId: string | undefined, cards: BoosterCardFilter[]): Promise<ObjectId[]> {
  const boosterIdsPerCard = await Promise.all(cards.map(async (card) => {
    const or: Record<string, unknown>[] = [{cardId: card.cardId}];
    if (card.setCode && card.collectorNumber) {
      or.push({setCode: card.setCode, collectorNumber: card.collectorNumber});
    }

    const match: Record<string, unknown> = {$or: or};
    if (userId) {
      match.userId = new ObjectId(userId);
    }

    // `distinct` n'est pas typé : on valide la forme des valeurs plutôt que de
    // l'affirmer, sinon un `boosterId` inattendu ferait échouer `new ObjectId`.
    const ids = await db.collection<BoosterCardDb>('booster-cards').distinct('boosterId', match);
    return new Set(ids.map((id) => (id ? String(id) : '')).filter((id) => ObjectId.isValid(id)));
  }));

  const [first, ...rest] = boosterIdsPerCard;
  const common = [...first].filter((id) => rest.every((ids) => ids.has(id)));

  return common.map((id) => new ObjectId(id));
}

async function boostersQuery({userId, gameId, type, cards}: BoosterFilters): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = {};
  if (gameId) {
    query['gameId'] = new ObjectId(gameId);
  }
  if (userId) {
    query['userId'] = new ObjectId(userId);
  }
  if (type) {
    const values = boosterTypeStoredValues(type);
    // Un booster sans type est un « Autre » qui s'ignore : il doit sortir avec eux.
    query['$or'] = type === OTHER_BOOSTER_TYPE
      ? [{type: {$in: values}}, {type: {$exists: false}}]
      : [{type: {$in: values}}];
  }
  if (cards && cards.length > 0) {
    query['_id'] = {$in: await boosterIdsContainingCards(userId, cards)};
  }

  return query;
}

/** Carte du filtre, telle qu'affichée au-dessus des résultats. */
export type BoosterFilterCard = {
  id: string;
  name: string;
  image: string;
  setCode: string;
  collectorNumber: string;
};

/**
 * Cartes correspondant aux identifiants demandés, dans l'ordre reçu. Un
 * identifiant absent de `cards` (carte supprimée depuis, URL bricolée) reste un
 * filtre à part entière, faute de quoi il disparaîtrait en silence et la liste
 * s'afficherait sans filtre du tout ; seul son libellé retombe sur l'identifiant
 * brut.
 */
export async function getBoosterFilterCards(gameId: string, cardIds: string[]): Promise<BoosterFilterCard[]> {
  if (cardIds.length === 0) {
    return [];
  }

  const cards = await getCardsByIds(new ObjectId(gameId), cardIds);
  const byId = new Map(cards.map((card) => [card.id, card]));

  return cardIds.map((id) => {
    const card = byId.get(id);
    return {
      id,
      name: card?.name ?? id,
      image: card?.image ?? '',
      setCode: card?.setCode ?? '',
      collectorNumber: card?.collectorNumber ?? '',
    };
  });
}

export function toBoosterCardFilters(cards: BoosterFilterCard[]): BoosterCardFilter[] {
  return cards.map((card) => ({cardId: card.id, setCode: card.setCode, collectorNumber: card.collectorNumber}));
}

export async function countBoosters(filters: BoosterFilters): Promise<number> {
  return await db.collection<BoosterDb>('boosters').countDocuments(await boostersQuery(filters));
}

/** Types de boosters présents chez l'utilisateur pour un jeu, pour ne proposer que des filtres qui donnent des résultats. */
export async function getBoosterTypesInUse({userId, gameId}: BoosterFilters): Promise<string[]> {
  // `$group` plutôt que `distinct` : ce dernier ignore les documents sans champ
  // `type`, alors que ces boosters comptent comme des « Autre ».
  const rows = await db.collection<BoosterDb>('boosters').aggregate<{_id: unknown}>([
    {$match: await boostersQuery({userId, gameId})},
    {$group: {_id: '$type'}},
  ]).toArray();

  const types = new Set(rows.map((row) => normalizeBoosterType(typeof row._id === 'string' ? row._id : undefined)));

  return [...types].sort();
}

export async function getBoosters({userId, gameId, type, cards, page = 0, limit = 20, offset = 0, sort = 'newest'}: BoosterFilters & {
  page?: number;
  limit?: number;
  offset?: number;
  sort?: BoosterSort;
}): Promise<Booster[]> {
  const query = await boostersQuery({userId, gameId, type, cards});

  const skip = page * limit + offset;

  const boosters = await db.collection<BoosterDb>('boosters').aggregate([
    {$match: query},
    {$sort: {createdAt: sort === 'oldest' ? 1 : -1}},
    {$skip: skip},
    {$limit: limit},
    {
      $lookup: {
        from: 'booster-cards',
        localField: '_id',
        foreignField: 'boosterId',
        as: 'cards',
        pipeline: [
          {
            $addFields: {
              id: {$toString: '$id'}
            }
          },
          {$project: {_id: 0, boosterId: 0}}
        ],
      },
    },
  ]).toArray();

  return boosters.map((booster) => ({
    gameId: booster.gameId.toString(),
    userId: booster.userId.toString(),
    setCode: booster.setCode,
    lang: booster.lang,
    type: booster.type,
    cards: booster.cards,
    note: booster.note,
    value: booster.price,
    estimatedValue: toBoosterValue(booster.estimatedValue),
    archived: booster.archived,
    addedToCollection: booster.addedToCollection ?? false,
    createdAt: booster.createdAt.toISOString(),
    id: booster._id.toString(),
    _id: undefined,
  }));
}

export async function getBooster(boosterId: string): Promise<Booster | null> {
  if (!ObjectId.isValid(boosterId)) {
    return null;
  }
  const booster = await db.collection<BoosterDb>('boosters').findOne({
    _id: new ObjectId(boosterId),
  });

  if (!booster) {
    return null;
  }

  const cards = await db.collection<BoosterCardDb>('booster-cards').find({
    boosterId: new ObjectId(boosterId),
  }).toArray();

  const game = await db.collection('games').findOne({_id: booster.gameId}, {projection: {slug: 1}});

  const boosterCards = await withCardAttributes(booster.gameId, cards.map((card) => ({
    ...card,
    id: card._id.toString(),
    boosterId: undefined,
    _id: undefined,
    userId: undefined,
  })) as BoosterCard[]);

  return {
    gameId: booster.gameId.toString(),
    game: game ? {
      id: booster.gameId.toString(),
      slug: game?.slug,
    } : undefined,
    userId: booster.userId.toString(),
    setCode: booster.setCode,
    lang: booster.lang,
    type: booster.type,
    cards: boosterCards,
    note: booster.note,
    value: booster.price,
    estimatedValue: toBoosterValue(booster.estimatedValue),
    archived: booster.archived,
    addedToCollection: booster.addedToCollection ?? false,
    createdAt: booster.createdAt.toISOString(),
    id: booster._id.toString(),
  };
}

/**
 * Recalcule la valeur d'un booster : la somme des prix de ses cartes, telle
 * qu'elle est au moment du clic.
 *
 * Le résultat est écrit sur le booster plutôt que recalculé à chaque
 * affichage — c'est ce qui en fait un relevé daté, comparable d'un booster à
 * l'autre, et non un chiffre qui bouge sous les yeux au gré des imports de
 * prix. Les cartes sans prix ne sont pas estimées : elles sont comptées à
 * part, pour que le total dise sur quoi il repose.
 */
export async function computeBoosterValue(boosterId: string): Promise<BoosterValue | null> {
  const booster = await getBooster(boosterId);

  if (!booster) {
    return null;
  }

  const sum = sumCardPrices(booster.cards.map((card) => card.marketPrice));
  const computedAt = new Date();

  const value: BoosterValue = {
    amount: sum?.amount ?? 0,
    currency: sum?.currency ?? CARDMARKET_CURRENCY,
    cardCount: booster.cards.length,
    pricedCards: sum?.priced ?? 0,
    computedAt: computedAt.toISOString(),
  };

  await db.collection<BoosterDb>('boosters').updateOne(
    {_id: new ObjectId(boosterId)},
    {$set: {estimatedValue: {...value, computedAt}}},
  );

  return value;
}

export async function userOwnsBooster(userId: string, boosterId: string): Promise<boolean> {
  if (!ObjectId.isValid(boosterId)) {
    return false;
  }
  const booster = await db.collection<BoosterDb>('boosters').findOne({
    _id: new ObjectId(boosterId),
    userId: new ObjectId(userId),
  }, {projection: {_id: 1}});
  return booster !== null;
}

export async function deleteBooster(boosterId: string): Promise<void> {
  const _id = new ObjectId(boosterId);
  await db.collection<BoosterCardDb>('booster-cards').deleteMany({boosterId: _id});
  await db.collection<BoosterDb>('boosters').deleteOne({_id});
}

export async function addCardToBooster(boosterId: string, card: Omit<BoosterCard, 'id'>): Promise<void> {
  const booster = await db.collection<BoosterDb>('boosters').findOne({
    _id: new ObjectId(boosterId),
  }, {projection: {_id: 1, userId: 1}});
  if (!booster) {
    throw new Error('Booster not found');
  }

  await db.collection<BoosterCardDb>('booster-cards').insertOne({
    ...card,
    boosterId: booster._id,
    userId: booster.userId,
  });
}

export async function addBoosterToCollection(userId: string, boosterId: string): Promise<number> {
  const _id = new ObjectId(boosterId);
  const uid = new ObjectId(userId);

  const cards = await db.collection<BoosterCardDb>('booster-cards').find({boosterId: _id}).toArray();
  if (cards.length > 0) {
    await db.collection('collection-cards').insertMany(cards.map((c) => ({
      userId: uid,
      cardId: c.cardId,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      name: c.name,
      image: c.image,
      ...(c.foil ? {foil: true} : {}),
      ...(c.printingId ? {printingId: c.printingId} : {}),
      ...(c.printingId && c.printingName ? {printingName: c.printingName} : {}),
      fromBoosterId: _id,
    })));
  }

  await db.collection<BoosterDb>('boosters').updateOne({_id}, {$set: {addedToCollection: true}});
  return cards.length;
}

export async function removeBoosterFromCollection(userId: string, boosterId: string): Promise<void> {
  const _id = new ObjectId(boosterId);
  const filter = {
    userId: new ObjectId(userId),
    fromBoosterId: _id,
  };

  const removedEntries = await db
    .collection<BoosterCardDb>('collection-cards')
    .find(filter, {projection: {_id: 1}})
    .toArray();

  await db.collection<BoosterCardDb>('collection-cards').deleteMany(filter);
  await removeSellListItemsByCollectionEntryIds(removedEntries.map((entry) => entry._id));
  await db.collection<BoosterDb>('boosters').updateOne({_id}, {$set: {addedToCollection: false}});
}

export async function setBoosterCardFoil(boosterId: string, entryId: string, foil: boolean): Promise<void> {
  await db.collection<BoosterCardDb>('booster-cards').updateOne(
    {_id: new ObjectId(entryId), boosterId: new ObjectId(boosterId)},
    foil ? {$set: {foil: true}} : {$unset: {foil: ""}},
  );
}

export async function removeCardFromBooster(boosterId: string, cardId: string): Promise<void> {
  console.log('Removing card', cardId, 'from booster', boosterId);
  const booster = await db.collection<BoosterDb>('boosters').findOne({
    _id: new ObjectId(boosterId),
  }, {projection: {_id: 1}});
  if (!booster) {
    throw new Error('Booster not found');
  }

  await db.collection<BoosterCardDb>('booster-cards').deleteOne({
    boosterId: booster._id,
    _id: new ObjectId(cardId),
  });
}

export type GroupedCard = {
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  quantity: number;
};

export async function getUserCards({
                                     userId,
                                     page = 0,
                                     limit = 50,
                                     gameId,
                                     setCode,
                                     cardType,
                                   }: {
  userId: string;
  page?: number;
  limit?: number;
  gameId?: string;
  setCode?: string;
  cardType?: string;
}): Promise<{ cards: GroupedCard[]; total: number }> {
  const skip = page * limit;

  const initialMatch: { setCode?: string; userId: ObjectId } = {
    userId: new ObjectId(userId),
  };
  if (setCode) {
    initialMatch.setCode = setCode;
  }

  // Agrégation pour grouper les cartes par setCode et collectorNumber
  const pipeline: Record<string, unknown>[] = [
    {
      $match: initialMatch,
    },
  ];

  const cardMatch: { "card.gameId"?: ObjectId; "card.type"?: string } = {};
  if (gameId) {
    cardMatch["card.gameId"] = new ObjectId(gameId);
  }
  if (cardType) {
    cardMatch["card.type"] = cardType;
  }
  if (gameId || cardType) {
    pipeline.push({
        $lookup: {
          from: 'cards',
          localField: "cardId",
          foreignField: "id",
          as: 'card',
        }
      },
      {
        $unwind: {
          path: "$card",
          preserveNullAndEmptyArrays: true,
        }
      },
      {
        $match: cardMatch,
      },
    )
  }

  pipeline.push({
      $group: {
        _id: {
          setCode: '$setCode',
          collectorNumber: '$collectorNumber',
        },
        name: {$first: '$name'},
        setCode: {$first: '$setCode'},
        collectorNumber: {$first: '$collectorNumber'},
        image: {$first: '$image'},
        card: { '$first': '$card' },
        quantity: {$sum: 1},
      },
    },
    {
      $sort: {
        setCode: 1,
        collectorNumber: 1,
      },
    }
  );

  // Compter le total
  const countResult = await db
    .collection<BoosterCardDb>('collection-cards')
    .aggregate([...pipeline, {$count: 'total'}])
    .toArray();

  const total = countResult.length > 0 ? countResult[0].total : 0;

  // Récupérer les cartes paginées
  const cards = await db
    .collection<BoosterCardDb>('collection-cards')
    .aggregate([
      ...pipeline,
      {$skip: skip},
      {$limit: limit},
      {
        $project: {
          _id: 0,
          name: 1,
          setCode: 1,
          collectorNumber: 1,
          image: 1,
          quantity: 1,
          card: 1,
        },
      },
    ], {
      collation: {
        locale: "en_US",
        numericOrdering: true
      }
    })
    .toArray();

  return {
    cards: cards as GroupedCard[],
    total,
  };
}

