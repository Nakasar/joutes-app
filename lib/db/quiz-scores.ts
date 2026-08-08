import "server-only";

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Scores obtenus par les joueurs sur les sections de quizz.
 *
 * Un quizz peut compter plusieurs sections, chacune terminée par son bouton de
 * validation ; le score est enregistré par section, pas par quizz. Rien n'est
 * gardé pour un visiteur non connecté — il n'y a pas de profil où le ranger.
 */

const COLLECTION_NAME = "quiz-scores";

/**
 * Index unique (utilisateur, quizz, section) : un joueur n'a qu'un score par
 * section, celui de sa dernière validation. Deux validations concurrentes ne
 * peuvent donc pas laisser deux lignes derrière elles — l'upsert retombe sur le
 * document existant. Best-effort, comme ailleurs dans le projet : un échec au
 * chargement (base indisponible) ne doit pas empêcher d'enregistrer un score.
 */
const indexReady = db
  .collection(COLLECTION_NAME)
  .createIndex({ userId: 1, quizId: 1, blockId: 1 }, { unique: true })
  .catch((error) => {
    console.error("Impossible de créer l'index unique des scores de quizz:", error);
  });

export type QuizScoreEntry = {
  quizId: string;
  quizTitle: string;
  gameSlug?: string;
  gameName?: string;
  /** Section du quizz — le bloc dont le bouton a produit ce score. */
  blockId: string;
  correct: number;
  total: number;
  updatedAt: Date;
};

/**
 * Enregistre le score d'une section, en remplaçant le précédent s'il y en a un.
 *
 * C'est bien le dernier score qui est gardé, non le meilleur : rejouer une
 * section est un réapprentissage, et afficher un score que la dernière tentative
 * dément induirait en erreur.
 */
export async function recordQuizScore({
  userId,
  quizId,
  blockId,
  correct,
  total,
}: {
  userId: string;
  quizId: string;
  blockId: string;
  correct: number;
  total: number;
}): Promise<void> {
  await indexReady;

  await db.collection(COLLECTION_NAME).updateOne(
    {
      userId: ObjectId.createFromHexString(userId),
      quizId: ObjectId.createFromHexString(quizId),
      blockId,
    },
    {
      $set: { correct, total, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

/**
 * Scores d'un joueur, de la validation la plus récente à la plus ancienne.
 *
 * Le titre du quizz et son jeu sont joints à la lecture plutôt que recopiés à
 * l'écriture : un quizz renommé doit apparaître sous son nom actuel. Un quizz
 * supprimé depuis emporte ses scores hors de la liste — la jointure ne trouve
 * plus rien à nommer.
 */
export async function getUserQuizScores(
  userId: string,
  { limit = 50 }: { limit?: number } = {}
): Promise<QuizScoreEntry[]> {
  const rows = await db
    .collection(COLLECTION_NAME)
    .aggregate([
      { $match: { userId: ObjectId.createFromHexString(userId) } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "quizzes",
          localField: "quizId",
          foreignField: "_id",
          as: "quiz",
          pipeline: [{ $project: { title: 1, gameId: 1 } }],
        },
      },
      { $unwind: "$quiz" },
      {
        $lookup: {
          from: "games",
          localField: "quiz.gameId",
          foreignField: "_id",
          as: "game",
          pipeline: [{ $project: { name: 1, slug: 1 } }],
        },
      },
      {
        $project: {
          _id: 0,
          quizId: { $toString: "$quizId" },
          quizTitle: "$quiz.title",
          gameSlug: { $arrayElemAt: ["$game.slug", 0] },
          gameName: { $arrayElemAt: ["$game.name", 0] },
          blockId: 1,
          correct: 1,
          total: 1,
          updatedAt: 1,
        },
      },
    ])
    .toArray();

  return rows as QuizScoreEntry[];
}
