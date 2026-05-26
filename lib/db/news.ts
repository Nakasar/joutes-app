import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { News } from "@/lib/types/News";
import { CreateNewsInput, UpdateNewsInput } from "@/lib/schemas/news.schema";

const COLLECTION_NAME = "news";

function toNews(doc: WithId<Document>, userId?: string): News {
  const likedBy: string[] = doc.likedBy ?? [];
  return {
    id: doc._id.toString(),
    title: doc.title,
    summary: doc.summary,
    content: doc.content,
    banner: doc.banner ?? undefined,
    gameIds: (doc.gameIds ?? []).map((id: ObjectId) => id.toString()),
    games: doc.games ?? undefined,
    tags: doc.tags ?? [],
    authorId: doc.authorId,
    author: doc.author ?? undefined,
    likedBy,
    likesCount: likedBy.length,
    userHasLiked: userId ? likedBy.includes(userId) : false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export type GetNewsOptions = {
  gameId?: string;
  tag?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
  userId?: string;
};

export type PaginatedNews = {
  news: News[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function getNews(options: GetNewsOptions = {}): Promise<PaginatedNews> {
  const { gameId, tag, dateFrom, dateTo, page = 1, limit = 10, userId } = options;

  const filter: Record<string, unknown> = {};

  if (gameId) {
    filter.gameIds = new ObjectId(gameId);
  }

  if (tag) {
    filter.tags = tag;
  }

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.$gte = dateFrom;
    if (dateTo) dateFilter.$lte = dateTo;
    filter.createdAt = dateFilter;
  }

  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: filter },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "games",
        localField: "gameIds",
        foreignField: "_id",
        as: "games",
        pipeline: [{ $project: { name: 1, slug: 1, icon: 1 } }],
      },
    },
    {
      $lookup: {
        from: "user",
        localField: "authorId",
        foreignField: "_id",
        as: "authorData",
        pipeline: [{ $project: { displayName: 1, discriminator: 1 } }],
      },
    },
    {
      $addFields: {
        author: { $arrayElemAt: ["$authorData", 0] },
        games: {
          $map: {
            input: "$games",
            as: "game",
            in: {
              id: { $toString: "$$game._id" },
              name: "$$game.name",
              slug: "$$game.slug",
              icon: "$$game.icon",
            },
          },
        },
      },
    },
    { $unset: "authorData" },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const results = await db.collection(COLLECTION_NAME).aggregate(pipeline).toArray();
  const result = results[0];
  const total = result.total?.[0]?.count ?? 0;

  const news = (result.data ?? []).map((doc: WithId<Document>) => toNews(doc, userId));

  return {
    news,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getNewsById(id: string, userId?: string): Promise<News | null> {
  try {
    const pipeline = [
      { $match: { _id: new ObjectId(id) } },
      {
        $lookup: {
          from: "games",
          localField: "gameIds",
          foreignField: "_id",
          as: "games",
          pipeline: [{ $project: { name: 1, slug: 1, icon: 1 } }],
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "authorId",
          foreignField: "_id",
          as: "authorData",
          pipeline: [{ $project: { displayName: 1, discriminator: 1 } }],
        },
      },
      {
        $addFields: {
          author: { $arrayElemAt: ["$authorData", 0] },
          games: {
            $map: {
              input: "$games",
              as: "game",
              in: {
                id: { $toString: "$$game._id" },
                name: "$$game.name",
                slug: "$$game.slug",
                icon: "$$game.icon",
              },
            },
          },
        },
      },
      { $unset: "authorData" },
    ];

    const docs = await db.collection(COLLECTION_NAME).aggregate(pipeline).toArray();
    if (!docs.length) return null;
    return toNews(docs[0] as WithId<Document>, userId);
  } catch {
    return null;
  }
}

export async function createNews(input: CreateNewsInput, authorId: string): Promise<News> {
  const now = new Date();
  const doc = {
    title: input.title,
    summary: input.summary,
    content: input.content,
    banner: input.banner ?? null,
    gameIds: input.gameIds.map((id) => new ObjectId(id)),
    tags: input.tags,
    authorId,
    likedBy: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  return {
    id: result.insertedId.toString(),
    ...input,
    banner: input.banner,
    authorId,
    likedBy: [],
    likesCount: 0,
    userHasLiked: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateNews(id: string, input: UpdateNewsInput): Promise<boolean> {
  const updateDoc: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updateDoc.title = input.title;
  if (input.summary !== undefined) updateDoc.summary = input.summary;
  if (input.content !== undefined) updateDoc.content = input.content;
  if (input.banner !== undefined) updateDoc.banner = input.banner ?? null;
  if (input.tags !== undefined) updateDoc.tags = input.tags;
  if (input.gameIds !== undefined) {
    updateDoc.gameIds = input.gameIds.map((gId) => new ObjectId(gId));
  }

  try {
    const result = await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );
    return result.matchedCount > 0;
  } catch {
    return false;
  }
}

export async function toggleLikeNews(newsId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
  const doc = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(newsId) });
  if (!doc) throw new Error("Actualité introuvable");

  const likedBy: string[] = doc.likedBy ?? [];
  const alreadyLiked = likedBy.includes(userId);

  if (alreadyLiked) {
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(newsId) },
      { $pull: { likedBy: userId } }
    );
    return { liked: false, likesCount: likedBy.length - 1 };
  } else {
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(newsId) },
      { $push: { likedBy: userId } }
    );
    return { liked: true, likesCount: likedBy.length + 1 };
  }
}

export async function getAllTags(): Promise<string[]> {
  const results = await db
    .collection(COLLECTION_NAME)
    .aggregate([
      { $unwind: { path: "$tags", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$tags" } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return results.map((r) => r._id as string).filter(Boolean);
}
