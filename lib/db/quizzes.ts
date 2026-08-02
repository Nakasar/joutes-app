import "server-only";

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { Quiz } from "@/lib/types/Quiz";
import { CreateQuizInput, QuizTranslationPayload, UpdateQuizInput } from "@/lib/schemas/quiz.schema";
import { defaultLocale, type Locale } from "@/i18n/config";

const COLLECTION_NAME = "quizzes";

function toQuiz(doc: WithId<Document>): Quiz {
  return {
    id: doc._id.toString(),
    title: doc.title,
    gameId: doc.gameId ? doc.gameId.toString() : undefined,
    game: doc.game ?? undefined,
    blocks: doc.blocks ?? [],
    // Les quizz écrits avant les traductions n'ont pas de langue d'origine :
    // ils sont en français, la langue par défaut de l'application.
    originalLang: doc.originalLang ?? defaultLocale,
    translations: doc.translations ?? undefined,
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
    originalLang: input.originalLang,
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
  if (input.originalLang !== undefined) updateDoc.originalLang = input.originalLang;

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

/**
 * Enregistre la traduction d'un quizz dans une langue, en remplaçant celle qui
 * s'y trouvait. `updatedAt` du quizz n'est volontairement pas touché : il
 * marque la dernière modification du *contenu*, ce qui permet de repérer les
 * traductions devenues obsolètes.
 */
export async function upsertQuizTranslation(
  id: string,
  lang: Locale,
  payload: QuizTranslationPayload
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const translation = { lang, title: payload.title, entries: payload.entries, updatedAt: new Date() };

  // Remplacement en une seule écriture, par pipeline : la langue est retirée du
  // tableau puis rajoutée dans la même opération. Un `$pull` suivi d'un `$push`
  // laisserait une fenêtre où la traduction n'existe plus, et la perdrait tout
  // à fait si la seconde écriture échouait.
  const result = await db.collection(COLLECTION_NAME).updateOne({ _id: new ObjectId(id) }, [
    {
      $set: {
        translations: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ["$translations", []] },
                cond: { $ne: ["$$this.lang", lang] },
              },
            },
            [translation],
          ],
        },
      },
    },
  ]);

  return result.matchedCount > 0;
}

/** Retire la traduction d'une langue. */
export async function deleteQuizTranslation(id: string, lang: Locale): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await db
    .collection(COLLECTION_NAME)
    .updateOne({ _id: new ObjectId(id) }, { $pull: { translations: { lang } } as never });

  return result.matchedCount > 0;
}

/** Suppression d'un quizz (modération). */
export async function deleteQuiz(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
