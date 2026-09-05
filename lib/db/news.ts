import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { News } from "@/lib/types/News";
import { CreateNewsInput, NewsTranslationPayload, UpdateNewsInput } from "@/lib/schemas/news.schema";
import { defaultLocale, type Locale } from "@/i18n/config";
import { getUserBadges, NO_BADGES } from "@/lib/db/user-badges";

const COLLECTION_NAME = "news";

/** Les textes dont une modification périme les traductions. */
const TRANSLATABLE_FIELDS = ["title", "summary", "content"] as const;

function toNews(doc: WithId<Document>, userId?: string): News {
  const likedBy: string[] = doc.likedBy ?? [];
  return {
    id: doc._id.toString(),
    title: doc.title,
    summary: doc.summary,
    content: doc.content,
    // Les actualités d'avant la traduction n'ont ni langue ni date de contenu :
    // elles sont relues en `fr`, et leur dernière retouche fait office de
    // dernière modification du texte.
    originalLang: doc.originalLang ?? defaultLocale,
    contentUpdatedAt: doc.contentUpdatedAt ?? doc.updatedAt ?? doc.createdAt,
    translations: doc.translations ?? undefined,
    banner: doc.banner ?? undefined,
    source: doc.source ?? undefined,
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

/**
 * Attache à chaque actualité les badges de son auteur.
 *
 * En lot, et non par article : la liste en affiche vingt, et une lecture par
 * auteur ferait vingt allers-retours pour deux badges.
 */
async function withAuthorBadges(news: News[]): Promise<News[]> {
  const badges = await getUserBadges(news.map((item) => String(item.authorId)));

  return news.map((item) =>
    item.author
      ? { ...item, author: { ...item.author, badges: badges[String(item.authorId)] ?? NO_BADGES } }
      : item
  );
}

export type GetNewsOptions = {
  /**
   * Un jeu, ou plusieurs.
   *
   * La liste sert le fil de l'accueil, qui montre les jeux qu'on suit : le
   * filtrer en mémoire après une lecture bornée viderait le fil de qui suit un
   * jeu discret parmi des jeux actifs. Une liste vide ne filtre rien, comme une
   * valeur absente — c'est ce que veut dire « cette personne ne suit aucun
   * jeu », et non « ne montre rien ».
   */
  gameId?: string | string[];
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

  const gameIds = Array.isArray(gameId) ? gameId : gameId ? [gameId] : [];

  if (gameIds.length === 1) {
    filter.gameIds = new ObjectId(gameIds[0]);
  } else if (gameIds.length > 1) {
    filter.gameIds = { $in: gameIds.map((id) => new ObjectId(id)) };
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

  const news = await withAuthorBadges(
    (result.data ?? []).map((doc: WithId<Document>) => toNews(doc, userId))
  );

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
    return (await withAuthorBadges([toNews(docs[0] as WithId<Document>, userId)]))[0];
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
    originalLang: input.originalLang,
    contentUpdatedAt: now,
    banner: input.banner ?? null,
    source: input.source ?? null,
    gameIds: input.gameIds.map((id) => new ObjectId(id)),
    tags: input.tags,
    authorId: new ObjectId(authorId),
    likedBy: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  return {
    id: result.insertedId.toString(),
    ...input,
    banner: input.banner,
    source: input.source ?? undefined,
    contentUpdatedAt: now,
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
  if (input.source !== undefined) updateDoc.source = input.source ?? null;
  if (input.originalLang !== undefined) updateDoc.originalLang = input.originalLang;
  if (input.tags !== undefined) updateDoc.tags = input.tags;
  if (input.gameIds !== undefined) {
    updateDoc.gameIds = input.gameIds.map((gId) => new ObjectId(gId));
  }

  try {
    // `contentUpdatedAt` ne bouge que si un texte change vraiment : c'est lui
    // qui signale une traduction en retard, et le formulaire renvoie toujours
    // tous les champs — sans cette comparaison, ajouter un tag ferait passer
    // toutes les traductions pour périmées.
    //
    // La comparaison se fait ici, sur le document relu, et non dans une étape
    // d'agrégation : là-bas, une valeur de l'utilisateur commençant par `$`
    // serait prise pour un chemin de champ, et un contenu markdown peut très
    // bien commencer ainsi.
    const current = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) }, { projection: { title: 1, summary: 1, content: 1 } });

    if (!current) return false;

    const textChanged = TRANSLATABLE_FIELDS.some(
      (field) => input[field] !== undefined && input[field] !== current[field]
    );
    if (textChanged) updateDoc.contentUpdatedAt = updateDoc.updatedAt;

    const result = await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );
    return result.matchedCount > 0;
  } catch {
    return false;
  }
}

/**
 * Enregistre — ou remplace — la traduction d'une actualité dans une langue.
 *
 * Remplacement en une seule écriture, par pipeline : la langue est retirée du
 * tableau puis rajoutée dans la même opération. Un `$pull` suivi d'un `$push`
 * laisserait une fenêtre où la traduction n'existe plus, et la perdrait tout à
 * fait si la seconde écriture échouait. Les textes passent par `$literal` :
 * dans un pipeline, une chaîne commençant par `$` serait lue comme un chemin
 * de champ, et un markdown peut commencer ainsi.
 */
export async function upsertNewsTranslation(
  id: string,
  lang: Locale,
  payload: NewsTranslationPayload
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const now = new Date();
  const translation = {
    lang,
    title: { $literal: payload.title },
    summary: { $literal: payload.summary },
    content: { $literal: payload.content },
    updatedAt: now,
  };

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
        // Une traduction n'est pas une modification du contenu : `updatedAt`
        // bouge, `contentUpdatedAt` non — sinon enregistrer une langue
        // périmerait toutes les autres.
        updatedAt: now,
      },
    },
  ]);

  return result.matchedCount > 0;
}

/** Retire la traduction d'une langue. */
export async function deleteNewsTranslation(id: string, lang: Locale): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await db
    .collection(COLLECTION_NAME)
    .updateOne(
      { _id: new ObjectId(id) },
      { $pull: { translations: { lang } } as never, $set: { updatedAt: new Date() } }
    );

  return result.matchedCount > 0;
}

export async function toggleLikeNews(
  newsId: string,
  userId: string
): Promise<{ liked: boolean; likesCount: number }> {
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(newsId) },
    [
      {
        $set: {
          likedBy: {
            $let: {
              vars: { likedBy: { $ifNull: ["$likedBy", []] } },
              in: {
                $cond: [
                  { $in: [userId, "$$likedBy"] },
                  { $setDifference: ["$$likedBy", [userId]] },
                  { $concatArrays: ["$$likedBy", [userId]] },
                ],
              },
            },
          },
        },
      },
    ],
    { returnDocument: "after", projection: { likedBy: 1 } }
  );

  if (!result?.value) throw new Error("Actualité introuvable");

  const likedBy: string[] = result.value.likedBy ?? [];
  return { liked: likedBy.includes(userId), likesCount: likedBy.length };
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

/** Suppression d'une actualité (modération). */
export async function deleteNews(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
