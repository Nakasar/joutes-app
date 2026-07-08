import 'server-only';
import db from "@/lib/mongodb";
import {Booster, BoosterCard, BoosterCardDb, BoosterDb} from "@/lib/types/booster";
import {ObjectId} from "bson";

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

export async function countBoosters({userId, gameId}: {
  userId?: string;
  gameId?: string;
}): Promise<number> {
  const query: {
    gameId?: ObjectId;
    userId?: ObjectId;
  } = {};
  if (gameId) {
    query['gameId'] = new ObjectId(gameId);
  }
  if (userId) {
    query['userId'] = new ObjectId(userId);
  }

  return await db.collection<BoosterDb>('boosters').countDocuments(query);
}

export async function getBoosters({userId, gameId, page = 0, limit = 20, offset = 0,}: {
  userId?: string;
  gameId?: string;
  page?: number;
  limit?: number;
  offset?: number;
}): Promise<Booster[]> {
  const query: {
    gameId?: ObjectId;
    userId?: ObjectId;
  } = {};
  if (gameId) {
    query['gameId'] = new ObjectId(gameId);
  }
  if (userId) {
    query['userId'] = new ObjectId(userId);
  }

  const skip = page * limit + offset;

  const boosters = await db.collection<BoosterDb>('boosters').aggregate([
    {$match: query},
    {$sort: {createdAt: -1}},
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
    value: booster.price,
    archived: booster.archived,
    addedToCollection: booster.addedToCollection ?? false,
    createdAt: booster.createdAt.toISOString(),
    id: booster._id.toString(),
    _id: undefined,
  }));
}

export async function getBooster(boosterId: string): Promise<Booster | null> {
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
    cards: cards.map((card) => ({
      ...card,
      id: card._id.toString(),
      boosterId: undefined,
      _id: undefined,
      userId: undefined,
    })),
    value: booster.price,
    archived: booster.archived,
    addedToCollection: booster.addedToCollection ?? false,
    createdAt: booster.createdAt.toISOString(),
    id: booster._id.toString(),
  };
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
      fromBoosterId: _id,
    })));
  }

  await db.collection<BoosterDb>('boosters').updateOne({_id}, {$set: {addedToCollection: true}});
  return cards.length;
}

export async function removeBoosterFromCollection(userId: string, boosterId: string): Promise<void> {
  const _id = new ObjectId(boosterId);
  await db.collection<BoosterCardDb>('collection-cards').deleteMany({
    userId: new ObjectId(userId),
    fromBoosterId: _id,
  });
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
    ])
    .toArray();

  return {
    cards: cards as GroupedCard[],
    total,
  };
}

