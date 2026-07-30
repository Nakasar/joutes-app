import 'server-only';

import { MongoServerError, ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import {
  ReportDb,
  ReportGroup,
  ReportableContentType,
  ReportReporter,
} from "@/lib/types/Report";
import { getReportedContentPreview } from "@/lib/db/reportable-content";

const COLLECTION_NAME = "reports";

// `createIndex` est idempotent : la promesse est mémorisée pour n'être jouée
// qu'une fois par instance, et attendue avant les écritures qui en dépendent.
// L'index unique est ce qui garantit qu'un utilisateur ne signale pas deux fois
// le même contenu en cas d'appels concurrents : un échec de création n'est donc
// ni avalé (l'écriture échoue plutôt que de laisser passer un doublon) ni
// mémorisé (l'appel suivant retente).
let reportIndexesReady: Promise<unknown> | null = null;

function ensureReportIndexes(): Promise<unknown> {
  if (!reportIndexesReady) {
    reportIndexesReady = Promise.all([
      db.collection(COLLECTION_NAME).createIndex({ contentType: 1, contentId: 1, reportedBy: 1 }, { unique: true }),
      db.collection(COLLECTION_NAME).createIndex({ status: 1, createdAt: -1 }),
    ]).catch((error) => {
      console.error("Impossible de créer les index des signalements:", error);
      reportIndexesReady = null;
      throw error;
    });
  }

  return reportIndexesReady;
}

type ReporterDoc = {
  _id: ObjectId;
  displayName?: string;
  discriminator?: string;
  username?: string;
  name?: string;
};

function toReporter(doc: ReporterDoc | undefined): ReportReporter | undefined {
  if (!doc) {
    return undefined;
  }

  const label =
    doc.displayName && doc.discriminator
      ? `${doc.displayName}#${doc.discriminator}`
      : doc.displayName ?? doc.username ?? doc.name ?? "Utilisateur inconnu";

  return { id: doc._id.toString(), label };
}

/**
 * Enregistre le signalement d'un contenu par un utilisateur. Un utilisateur ne
 * peut signaler un contenu qu'une seule fois : re-signaler un contenu déjà
 * signalé puis ignoré par un administrateur le remet en attente (c'est le
 * comportement attendu de l'action « ignorer », qui masque le signalement
 * jusqu'à ce qu'il soit re-signalé).
 *
 * @returns `true` si le signalement a été créé ou réactivé, `false` s'il était
 * déjà en attente.
 */
export async function createReport({
  contentType,
  contentId,
  reportedBy,
  reason,
}: {
  contentType: ReportableContentType;
  contentId: string;
  reportedBy: string;
  reason?: string;
}): Promise<boolean> {
  await ensureReportIndexes();

  const now = new Date();
  const filter = {
    contentType,
    contentId,
    reportedBy: new ObjectId(reportedBy),
  };

  const existing = await db.collection<ReportDb>(COLLECTION_NAME).findOne(filter);
  if (existing?.status === "pending") {
    return false;
  }

  try {
    await db.collection<ReportDb>(COLLECTION_NAME).updateOne(
      filter,
      {
        $set: {
          status: "pending",
          reason,
          createdAt: now,
          updatedAt: now,
        },
        $unset: { ignoredAt: "", ignoredBy: "" },
      },
      { upsert: true }
    );
  } catch (error) {
    // Deux signalements simultanés du même utilisateur : l'index unique en
    // rejette un (E11000). Le contenu est bien signalé, rien à ajouter.
    if (error instanceof MongoServerError && error.code === 11000) {
      return false;
    }

    throw error;
  }

  return true;
}

type ReportGroupAggregate = {
  _id: { contentType: ReportableContentType; contentId: string };
  count: number;
  firstReportedAt: Date;
  lastReportedAt: Date;
  reports: {
    reason?: string;
    createdAt: Date;
    reporter?: ReporterDoc;
  }[];
};

/**
 * Signalements en attente, regroupés par contenu et enrichis d'un aperçu du
 * contenu concerné. Les groupes les plus récemment signalés viennent en
 * premier ; à égalité, les plus signalés d'abord.
 */
export async function getPendingReportGroups(): Promise<ReportGroup[]> {
  const groups = await db
    .collection<ReportDb>(COLLECTION_NAME)
    .aggregate<ReportGroupAggregate>([
      { $match: { status: "pending" } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "user",
          localField: "reportedBy",
          foreignField: "_id",
          as: "reporterData",
          pipeline: [{ $project: { displayName: 1, discriminator: 1, username: 1, name: 1 } }],
        },
      },
      {
        $group: {
          _id: { contentType: "$contentType", contentId: "$contentId" },
          count: { $sum: 1 },
          firstReportedAt: { $min: "$createdAt" },
          lastReportedAt: { $max: "$createdAt" },
          reports: {
            $push: {
              reason: "$reason",
              createdAt: "$createdAt",
              reporter: { $arrayElemAt: ["$reporterData", 0] },
            },
          },
        },
      },
      { $sort: { lastReportedAt: -1, count: -1 } },
    ])
    .toArray();

  return Promise.all(
    groups.map(async (group) => ({
      contentType: group._id.contentType,
      contentId: group._id.contentId,
      count: group.count,
      firstReportedAt: group.firstReportedAt,
      lastReportedAt: group.lastReportedAt,
      reasons: group.reports.map((report) => ({
        reason: report.reason,
        createdAt: report.createdAt,
        reporter: toReporter(report.reporter),
      })),
      content: await getReportedContentPreview(group._id.contentType, group._id.contentId),
    }))
  );
}

/** Nombre de contenus distincts ayant au moins un signalement en attente. */
export async function countPendingReportedContents(): Promise<number> {
  const result = await db
    .collection<ReportDb>(COLLECTION_NAME)
    .aggregate<{ count: number }>([
      { $match: { status: "pending" } },
      { $group: { _id: { contentType: "$contentType", contentId: "$contentId" } } },
      { $count: "count" },
    ])
    .toArray();

  return result[0]?.count ?? 0;
}

/**
 * Masque tous les signalements en attente d'un contenu. Ils ne réapparaîtront
 * que si le contenu est signalé à nouveau.
 */
export async function ignoreReportsForContent({
  contentType,
  contentId,
  ignoredBy,
}: {
  contentType: ReportableContentType;
  contentId: string;
  ignoredBy: string;
}): Promise<number> {
  const now = new Date();

  const result = await db.collection<ReportDb>(COLLECTION_NAME).updateMany(
    { contentType, contentId, status: "pending" },
    {
      $set: {
        status: "ignored",
        ignoredAt: now,
        ignoredBy: new ObjectId(ignoredBy),
        updatedAt: now,
      },
    }
  );

  return result.modifiedCount;
}

/** Supprime les signalements d'un contenu (après suppression de celui-ci). */
export async function deleteReportsForContent({
  contentType,
  contentId,
}: {
  contentType: ReportableContentType;
  contentId: string;
}): Promise<number> {
  const result = await db.collection<ReportDb>(COLLECTION_NAME).deleteMany({ contentType, contentId });

  return result.deletedCount;
}

