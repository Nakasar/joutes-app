import "server-only";

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { Quiz } from "@/lib/types/Quiz";
import { CreateQuizInput, UpdateQuizInput } from "@/lib/schemas/quiz.schema";

const COLLECTION_NAME = "quizzes";

function toQuiz(doc: WithId<Document>): Quiz {
  return {
    id: doc._id.toString(),
    title: doc.title,
    gameId: doc.gameId ? doc.gameId.toString() : undefined,
    game: doc.game ?? undefined,
    blocks: doc.blocks ?? [],
    authorId: doc.authorId?.toString?.() ?? doc.authorId,
    author: doc.author ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Resolves the linked game (if any) and the author's display info, shared by
// every read path below.
const populateLookupStages = [
  {
    $lookup: {
      from: "games",
      localField: "gameId",
      foreignField: "_id",
      as: "gameData",
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
      game: {
        $let: {
          vars: { g: { $arrayElemAt: ["$gameData", 0] } },
          in: {
            $cond: [
              { $ifNull: ["$$g", false] },
              { id: { $toString: "$$g._id" }, name: "$$g.name", slug: "$$g.slug", icon: "$$g.icon" },
              "$$REMOVE",
            ],
          },
        },
      },
    },
  },
  { $unset: ["authorData", "gameData"] },
];

export type GetQuizzesOptions = {
  gameId?: string;
  page?: number;
  limit?: number;
};

export type PaginatedQuizzes = {
  quizzes: Quiz[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function getQuizzes(options: GetQuizzesOptions = {}): Promise<PaginatedQuizzes> {
  const { gameId, page = 1, limit = 10 } = options;

  const filter: Record<string, unknown> = {};
  if (gameId) {
    filter.gameId = new ObjectId(gameId);
  }

  const skip = (page - 1) * limit;

  // The $lookup/$addFields in populateLookupStages only need to run on the
  // page actually being returned, so they live inside the $facet's `data`
  // branch (after $skip/$limit) rather than before it — otherwise every
  // matched document would be joined against games/user just to be
  // discarded by pagination.
  const pipeline = [
    { $match: filter },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }, ...populateLookupStages],
        total: [{ $count: "count" }],
      },
    },
  ];

  const results = await db.collection(COLLECTION_NAME).aggregate(pipeline).toArray();
  const result = results[0];
  const total = result?.total?.[0]?.count ?? 0;
  const quizzes = (result?.data ?? []).map((doc: WithId<Document>) => toQuiz(doc));

  return {
    quizzes,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getQuizById(id: string): Promise<Quiz | null> {
  if (!ObjectId.isValid(id)) return null;

  try {
    const pipeline = [{ $match: { _id: new ObjectId(id) } }, ...populateLookupStages];
    const docs = await db.collection(COLLECTION_NAME).aggregate(pipeline).toArray();
    if (!docs.length) return null;
    return toQuiz(docs[0] as WithId<Document>);
  } catch {
    return null;
  }
}

export async function createQuiz(input: CreateQuizInput, authorId: string): Promise<Quiz> {
  const now = new Date();
  const doc = {
    title: input.title,
    ...(input.gameId ? { gameId: new ObjectId(input.gameId) } : {}),
    blocks: input.blocks,
    authorId: new ObjectId(authorId),
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  const created = await getQuizById(result.insertedId.toString());
  if (!created) {
    throw new Error("Failed to create quiz");
  }
  return created;
}

export async function updateQuiz(id: string, input: UpdateQuizInput): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const updateDoc: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) updateDoc.title = input.title;
  if (input.blocks !== undefined) updateDoc.blocks = input.blocks;

  const unset: Record<string, ""> = {};
  if (input.gameId !== undefined) {
    if (input.gameId) {
      updateDoc.gameId = new ObjectId(input.gameId);
    } else {
      unset.gameId = "";
    }
  }

  try {
    const result = await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) }
    );
    return result.matchedCount > 0;
  } catch {
    return false;
  }
}
