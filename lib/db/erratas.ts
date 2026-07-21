import 'server-only';

import db from "@/lib/mongodb";
import { Errata, ErrataDb, ErrataType } from "@/lib/types/errata";
import { ObjectId } from "bson";

type ErrataAggregateResult = ErrataDb & {
  _id: ObjectId;
  cards?: Errata['cards'];
  votesList?: { userId: ObjectId; vote: string }[];
};

function toErrata(errata: ErrataAggregateResult, userId?: string): Errata {
  return {
    id: errata._id.toString(),
    cardIds: errata.cardIds,
    cards: errata.cards,
    type: errata.type,
    details: errata.details,
    originalLang: errata.originalLang ?? "fr",
    contentUpdatedAt: errata.contentUpdatedAt ?? errata.createdAt,
    translations: errata.translations,
    source: errata.source,
    errataDate: errata.errataDate,
    createdBy: errata.createdBy.toString(),
    createdAt: errata.createdAt,
    deprecatedAt: errata.deprecatedAt,
    votes: {
      positive: (errata.votesList ?? []).filter((v) => v.vote === 'positive').length,
      negative: (errata.votesList ?? []).filter((v) => v.vote === 'negative').length,
      userVote: userId
        ? (errata.votesList ?? []).find((v) => v.userId.toString() === userId)?.vote as Errata['votes']['userVote']
        : undefined,
    },
  };
}

async function getGameCardIds(gameId: ObjectId): Promise<string[]> {
  const cards = await db.collection<{ id: string }>("cards").find({ gameId }, { projection: { _id: 0, id: 1 } }).toArray();
  return cards.map((c) => c.id);
}

// Matches both the current `cardIds` array field and the legacy scalar `cardId`
// field, so erratas still keep working during the deployment window before
// `scripts/migrate-errata-cardid-to-cardids.ts` has run against the database.
function buildErrataCardIdsMatchFilter(cardIds: string[]): Record<string, unknown> {
  return { $or: [{ cardIds: { $in: cardIds } }, { cardId: { $in: cardIds } }] };
}

export async function countErratasByGameId(gameId: string): Promise<number> {
  const cardIds = await getGameCardIds(new ObjectId(gameId));
  if (cardIds.length === 0) return 0;

  return db.collection<ErrataDb>("erratas").countDocuments(buildErrataCardIdsMatchFilter(cardIds));
}

export async function getErratasByGameId({
                                            gameId,
                                            offset = 0,
                                            limit = 20,
                                            userId,
                                            sortOrder = "asc",
                                          }: {
  gameId: string;
  offset?: number;
  limit?: number;
  userId?: string;
  sortOrder?: "asc" | "desc";
}): Promise<Errata[]> {
  const cardIds = await getGameCardIds(new ObjectId(gameId));
  if (cardIds.length === 0) return [];

  const sortDir = sortOrder === "asc" ? 1 : -1;

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate<ErrataAggregateResult>([
      { $match: buildErrataCardIdsMatchFilter(cardIds) },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardIds',
          foreignField: 'id',
          as: 'cards',
          pipeline: [
            { $project: { _id: 0, gameId: 0 } },
          ],
        },
      },
      // `$min` (rather than `$arrayElemAt: [..., 0]`) keeps the sort deterministic:
      // `$lookup` does not guarantee element order for a `cardIds` array match.
      { $addFields: { primaryCardName: { $min: '$cards.name' } } },
      { $sort: { primaryCardName: sortDir as 1 | -1, errataDate: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'errata-votes',
          localField: '_id',
          foreignField: 'errataId',
          as: 'votesList',
        },
      },
    ])
    .toArray();

  return erratasDb.map((errata) => toErrata(errata, userId));
}

export async function getErratasByCardId(cardId: string, userId?: string): Promise<Errata[]> {
  const card = await db.collection("cards").findOne({ id: cardId });
  const matchingCardIds = card
    ? await db.collection('cards').find({ name: card.name }, { projection: { id: 1 } }).toArray()
    : null;

  // Matches both the current `cardIds` array field and the legacy scalar `cardId`
  // field, so erratas still keep working during the deployment window before
  // `scripts/migrate-errata-cardid-to-cardids.ts` has run against the database.
  const matchFilter = matchingCardIds
    ? {
        $or: [
          { cardIds: { $in: matchingCardIds.map((i) => i.id) } },
          { cardId: { $in: matchingCardIds.map((i) => i.id) } },
        ],
      }
    : { $or: [{ cardIds: cardId }, { cardId }] };

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate<ErrataAggregateResult>([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'errata-votes',
          localField: '_id',
          foreignField: 'errataId',
          as: 'votesList',
        },
      },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardIds',
          foreignField: 'id',
          as: 'cards',
          pipeline: [
            { $project: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1 } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
    ])
    .toArray();

  return erratasDb.map((errata) => toErrata(errata, userId));
}

async function buildErrataMatchFilter({
                                        search,
                                        type,
                                      }: {
  search?: string;
  type?: ErrataType | "all";
}): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  if (type && type !== "all") {
    filter.type = type;
  }

  if (search?.trim()) {
    const matchingCards = await db
      .collection("cards")
      .find({ name: { $regex: search.trim(), $options: "i" } }, { projection: { id: 1 } })
      .toArray();
    const ids = matchingCards.map((c) => c.id);
    // Same legacy `cardId` fallback as getErratasByCardId, see comment there.
    filter.$or = [{ cardIds: { $in: ids } }, { cardId: { $in: ids } }];
  }

  return filter;
}

export async function countAllErratas({
                                        search,
                                        type,
                                      }: { search?: string; type?: ErrataType | "all" } = {}): Promise<number> {
  const filter = await buildErrataMatchFilter({ search, type });
  return db.collection<ErrataDb>("erratas").countDocuments(filter);
}

export async function getAllErratas({
                                      offset = 0,
                                      limit = 50,
                                      userId,
                                      search,
                                      type,
                                      sortOrder = "asc",
                                    }: {
  offset?: number;
  limit?: number;
  userId?: string;
  search?: string;
  type?: ErrataType | "all";
  sortOrder?: "asc" | "desc";
}): Promise<Errata[]> {
  const matchFilter = await buildErrataMatchFilter({ search, type });
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate<ErrataAggregateResult>([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardIds',
          foreignField: 'id',
          as: 'cards',
          pipeline: [
            { $project: { _id: 0, gameId: 0 } },
          ],
        },
      },
      // `$min` (rather than `$arrayElemAt: [..., 0]`) keeps the sort deterministic:
      // `$lookup` does not guarantee element order for a `cardIds` array match.
      { $addFields: { primaryCardName: { $min: '$cards.name' } } },
      { $sort: { primaryCardName: sortDir as 1 | -1, errataDate: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'errata-votes',
          localField: '_id',
          foreignField: 'errataId',
          as: 'votesList',
        },
      },
    ])
    .toArray();

  return erratasDb.map((errata) => toErrata(errata, userId));
}
