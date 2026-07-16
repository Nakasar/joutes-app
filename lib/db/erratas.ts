import 'server-only';

import db from "@/lib/mongodb";
import { Errata, ErrataDb, ErrataType } from "@/lib/types/errata";
import { ObjectId } from "bson";

export async function getErratasByCardId(cardId: string, userId?: string): Promise<Errata[]> {
  const card = await db.collection("cards").findOne({ id: cardId });
  const matchingCardIds = card
    ? await db.collection('cards').find({ name: card.name }, { projection: { id: 1 } }).toArray()
    : null;

  const matchFilter = matchingCardIds
    ? { cardId: { $in: matchingCardIds.map((i) => i.id) } }
    : { cardId };

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate([
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
        $addFields: {
          positiveCount: {
            $size: { $filter: { input: '$votesList', as: 'v', cond: { $eq: ['$$v.vote', 'positive'] } } },
          },
          negativeCount: {
            $size: { $filter: { input: '$votesList', as: 'v', cond: { $eq: ['$$v.vote', 'negative'] } } },
          },
        },
      },
      {
        $addFields: {
          isDownranked: {
            $or: [
              { $ifNull: ['$deprecatedAt', false] },
              { $gt: ['$negativeCount', '$positiveCount'] },
            ],
          },
        },
      },
      { $sort: { isDownranked: 1, createdAt: -1 } },
    ])
    .toArray();

  return erratasDb.map((errata) => ({
    id: errata._id.toString(),
    cardId: errata.cardId,
    type: errata.type,
    details: errata.details,
    source: errata.source,
    errataDate: errata.errataDate,
    createdBy: errata.createdBy.toString(),
    createdAt: errata.createdAt,
    deprecatedAt: errata.deprecatedAt,
    votes: {
      positive: (errata.votesList ?? []).filter((v: { vote: string }) => v.vote === 'positive').length,
      negative: (errata.votesList ?? []).filter((v: { vote: string }) => v.vote === 'negative').length,
      userVote: userId
        ? (errata.votesList ?? []).find((v: { userId: ObjectId; vote: string }) => v.userId.toString() === userId)?.vote
        : undefined,
    },
  }));
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
    filter.cardId = { $in: matchingCards.map((c) => c.id) };
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
    .aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardId',
          foreignField: 'id',
          as: 'card',
          pipeline: [
            { $limit: 1 },
            { $project: { _id: 0, gameId: 0 } },
          ],
        },
      },
      {
        $unwind: {
          path: '$card',
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { "card.name": sortDir as 1 | -1, errataDate: -1 } },
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

  return erratasDb.map((errata) => ({
    id: errata._id.toString(),
    cardId: errata.cardId,
    card: errata.card,
    type: errata.type,
    details: errata.details,
    source: errata.source,
    errataDate: errata.errataDate,
    createdBy: errata.createdBy.toString(),
    createdAt: errata.createdAt,
    deprecatedAt: errata.deprecatedAt,
    votes: {
      positive: (errata.votesList ?? []).filter((v: { vote: string }) => v.vote === 'positive').length,
      negative: (errata.votesList ?? []).filter((v: { vote: string }) => v.vote === 'negative').length,
      userVote: userId
        ? (errata.votesList ?? []).find((v: { userId: ObjectId; vote: string }) => v.userId.toString() === userId)?.vote
        : undefined,
    },
  }));
}
