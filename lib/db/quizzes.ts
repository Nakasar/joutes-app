import "server-only";

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { Quiz } from "@/lib/types/Quiz";
import { CreateQuizInput, QuizTranslationPayload, UpdateQuizInput } from "@/lib/schemas/quiz.schema";
import { getCardsByIds } from "@/lib/db/cards";
import { defaultLocale, type Locale } from "@/i18n/config";

const COLLECTION_NAME = "quizzes";

function toQuiz(doc: WithId<Document>): Quiz {
  return {
    id: doc._id.toString(),
    title: doc.title,
    gameId: doc.gameId ? doc.gameId.toString() : undefined,
    game: doc.game ?? undefined,
    coverImageUrl: doc.coverImageUrl ?? undefined,
    coverCardId: doc.coverCardId ?? undefined,
    coverImage: doc.coverImage ?? undefined,
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

/**
 * La couverture telle qu'elle s'écrit en base.
 *
 * `coverImage` est **dérivée** : c'est l'adresse que les listes affichent sans
 * résoudre le catalogue de cartes du jeu. La calculer ici, une fois par
 * enregistrement, évite autant de requêtes que de vignettes sur une page de
 * liste.
 *
 * Une carte n'illustre que si le catalogue du jeu la connaît : un identifiant
 * qui ne résout pas — jeu changé depuis, carte retirée, valeur inventée par un
 * client d'API — ne laisse pas une référence morte sur le quizz. C'est aussi ce
 * qui borne le champ : son contenu vient du client, mais l'adresse affichée
 * vient toujours du catalogue.
 */
async function deriveQuizCover(
  gameId: string | undefined,
  choice: { coverCardId?: string; coverImageUrl?: string }
): Promise<{ coverCardId?: string; coverImageUrl?: string; coverImage?: string }> {
  if (choice.coverImageUrl) {
    return {
      // La carte désignée survit sous l'image déposée : la retirer rend la
      // couverture à la carte, sans avoir à la rechercher une seconde fois.
      ...(choice.coverCardId ? { coverCardId: choice.coverCardId } : {}),
      coverImageUrl: choice.coverImageUrl,
      coverImage: choice.coverImageUrl,
    };
  }

  if (!choice.coverCardId || !gameId || !ObjectId.isValid(gameId)) {
    return {};
  }

  const [card] = await getCardsByIds(new ObjectId(gameId), [choice.coverCardId]);
  if (!card?.image) {
    return {};
  }

  return { coverCardId: choice.coverCardId, coverImage: card.image };
}

export async function createQuiz(input: CreateQuizInput, authorId: string): Promise<Quiz> {
  const now = new Date();
  const cover = await deriveQuizCover(input.gameId, {
    coverCardId: input.coverCardId,
    coverImageUrl: input.coverImageUrl,
  });
  const doc = {
    title: input.title,
    ...(input.gameId ? { gameId: new ObjectId(input.gameId) } : {}),
    originalLang: input.originalLang,
    ...cover,
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

/**
 * Ce qu'un `PATCH` dit d'un champ de couverture.
 *
 * Trois cas, et non deux : le champ absent laisse la valeur en base — un
 * enregistrement de contenu ne doit pas effacer une couverture qu'il ne
 * mentionne pas —, la chaîne vide est le geste « retirer », et une valeur la
 * remplace.
 */
function readCoverChoice(update: string | undefined, current: unknown): string | undefined {
  if (update === undefined) {
    return typeof current === "string" && current ? current : undefined;
  }

  return update || undefined;
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

  // Le jeu compte autant que le choix lui-même : déplacer un quizz vers un
  // autre jeu emmène une carte que le nouveau catalogue ne connaît pas, et
  // c'est la dérivation qui s'en aperçoit.
  if (
    input.coverCardId !== undefined ||
    input.coverImageUrl !== undefined ||
    input.gameId !== undefined
  ) {
    const existing = await db
      .collection(COLLECTION_NAME)
      .findOne(
        { _id: new ObjectId(id) },
        { projection: { gameId: 1, coverCardId: 1, coverImageUrl: 1 } }
      );

    if (existing) {
      const gameId =
        input.gameId !== undefined ? input.gameId : existing.gameId?.toString();

      const cover = await deriveQuizCover(gameId || undefined, {
        coverCardId: readCoverChoice(input.coverCardId, existing.coverCardId),
        coverImageUrl: readCoverChoice(input.coverImageUrl, existing.coverImageUrl),
      });

      // Écrire ou retirer, jamais les deux : Mongo refuse un champ à la fois
      // dans `$set` et dans `$unset`.
      for (const key of ["coverCardId", "coverImageUrl", "coverImage"] as const) {
        if (cover[key] === undefined) {
          unset[key] = "";
        } else {
          updateDoc[key] = cover[key];
        }
      }
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
