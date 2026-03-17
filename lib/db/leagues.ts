import db from "@/lib/mongodb";
import {
  League,
  CreateLeagueInput,
  UpdateLeagueInput,
  SearchLeaguesOptions,
  PaginatedLeaguesResult,
  LeagueParticipant,
  CreateLeagueMatchInput,
  PointHistoryEntry,
  KillerTarget,
} from "@/lib/types/League";
import { LeagueMatch, LeagueTypeMatch, MatchFeatAward } from "@/lib/types/Match";
import {ObjectId, WithId, Document, Filter} from "mongodb";
import {nanoid} from "nanoid";
import { DateTime } from "luxon";
import {User} from "@/lib/types/User";
import { getUserById, getUsersByIds } from "@/lib/db/users";
import { notifyLairOwnersWithTemplate, notifyUserWithTemplate } from "@/lib/services/notifications";
import { getLairById } from "@/lib/db/lairs";
import { 
  createMatch,
  getMatches,
  deleteMatch,
} from "@/lib/db/matches";

const COLLECTION_NAME = "leagues";
const PARTICIPANTS_COLLECTION = "league-participants";
const FEATS_COLLECTION = "league-participant-feats";

// Type pour une ligue dans MongoDB (avec _id, sans participants)
export type LeagueDocument = Omit<League, "id" | "lairs" | "games" | "creator" | "participantsCount" | "participants"> & { _id: ObjectId };

// Type pour un participant dans MongoDB
export type LeagueParticipantDocument = Omit<LeagueParticipant, "feats"> & {
  _id: ObjectId;
  leagueId: ObjectId;
};

// Type pour un haut fait dans MongoDB
export type LeagueParticipantFeatDocument = {
  _id: ObjectId;
  leagueId: ObjectId;
  userId: string;
  featId: string;
  earnedAt: Date;
  eventId?: string;
  matchId?: string;
  createdAt: Date;
};

export type LeagueParticipantManageFeat = {
  id: string;
  featId: string;
  title: string;
  points: number;
  earnedAt: Date;
  eventId?: string;
  matchId?: string;
};

export type LeagueParticipantManualPointEntry = {
  historyIndex: number;
  date: Date;
  points: number;
  reason: string;
  eventId?: string;
};

export type LeagueParticipantManageDetails = {
  feats: LeagueParticipantManageFeat[];
  manualPoints: LeagueParticipantManualPointEntry[];
};

// Convertir un document MongoDB en League
async function toLeague(
  doc: WithId<Document>,
  includeParticipants: boolean = true,
  matchesOverride?: LeagueMatch[]
): Promise<League> {
  const leagueId = doc._id.toString();

  let participants: LeagueParticipant[] = [];

  if (includeParticipants) {
    // Récupérer les participants avec leurs hauts faits depuis les nouvelles collections
    const participantDocs = await db.collection(PARTICIPANTS_COLLECTION)
      .find({ leagueId: new ObjectId(leagueId) })
      .toArray();

    participants = await Promise.all(participantDocs.map(async (p) => {
      // Récupérer les hauts faits du participant
      const featDocs = await db.collection(FEATS_COLLECTION)
        .find({
          leagueId: new ObjectId(leagueId),
          userId: p.userId
        })
        .toArray();

      return {
        userId: p.userId,
        points: p.points,
        pointsHistory: (p.pointsHistory || []).map((h: PointHistoryEntry) => ({
          ...h,
          date: new Date(h.date),
        })),
        feats: featDocs.map((f) => ({
          featId: f.featId,
          earnedAt: new Date(f.earnedAt),
          eventId: f.eventId,
          matchId: f.matchId,
        })),
        joinedAt: new Date(p.joinedAt),
        eliminatedAt: p.eliminatedAt ? new Date(p.eliminatedAt) : undefined,
        eliminatedBy: p.eliminatedBy,
        isEliminated: p.isEliminated,
      };
    }));
  }

  return {
    id: leagueId,
    name: doc.name,
    description: doc.description,
    banner: doc.banner,
    format: doc.format,
    killerConfig: doc.killerConfig,
    pointsConfig: doc.pointsConfig,
    startDate: doc.startDate ? new Date(doc.startDate) : undefined,
    endDate: doc.endDate ? new Date(doc.endDate) : undefined,
    registrationDeadline: doc.registrationDeadline
      ? new Date(doc.registrationDeadline)
      : undefined,
    status: doc.status,
    creatorId: doc.creatorId,
    creator: doc.creator,
    organizerIds: doc.organizerIds || [],
    participantsCount: doc.participantsCount,
    participants,
    maxParticipants: doc.maxParticipants,
    minParticipants: doc.minParticipants,
    isPublic: doc.isPublic,
    invitationCode: doc.invitationCode,
    gameIds: doc.gameIds.map((g: ObjectId) => g.toString()) || [],
    games: doc.games || [],
    lairIds: doc.lairIds.map((g: ObjectId) => g.toString()) || [],
    lairs: doc.lairs || [],
    matches: (matchesOverride || doc.matches || []).map((m: LeagueMatch) => ({
      ...m,
      playedAt: new Date(m.playedAt),
      createdAt: new Date(m.createdAt),
      reportedAt: m.reportedAt ? new Date(m.reportedAt) : undefined,
      confirmedAt: m.confirmedAt ? new Date(m.confirmedAt) : undefined,
    })),
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
  };
}

// Convertir une League en document MongoDB (sans id ni participants)
function toDocument(
  league: CreateLeagueInput
): Omit<LeagueDocument, "_id"> {
  return {
    name: league.name,
    description: league.description,
    banner: league.banner,
    format: league.format,
    killerConfig: league.killerConfig,
    pointsConfig: league.pointsConfig,
    startDate: league.startDate,
    endDate: league.endDate,
    registrationDeadline: league.registrationDeadline,
    status: league.status,
    creatorId: league.creatorId,
    organizerIds: league.organizerIds,
    maxParticipants: league.maxParticipants,
    minParticipants: league.minParticipants,
    isPublic: league.isPublic,
    invitationCode: league.invitationCode,
    gameIds: league.gameIds,
    lairIds: league.lairIds,
    matches: league.matches || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Créer une nouvelle ligue
export async function createLeague(
  input: CreateLeagueInput
): Promise<League> {
  const doc = toDocument(input);

  // Générer un code d'invitation si la ligue est privée
  if (!input.isPublic && !input.invitationCode) {
    doc.invitationCode = nanoid(10);
  }

  const result = await db.collection(COLLECTION_NAME).insertOne(doc);

  return {
    id: result.insertedId.toString(),
    ...input,
    participants: input.participants || [],
    matches: input.matches || [],
    invitationCode: doc.invitationCode,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    games: [],
    lairs: [],
  };
}

// Récupérer une ligue par son ID
export async function getLeagueById(id: string): Promise<League | null> {
  try {
    const doc = await db
      .collection(COLLECTION_NAME)
      .aggregate<LeagueDocument>([
        {
          $match: { _id: new ObjectId(id) }
        },
        {
          $lookup: {
            from: PARTICIPANTS_COLLECTION,
            localField: "_id",
            foreignField: "leagueId",
            as: "participantsTemp",
          }
        },
        {
          $addFields: {
            participantsCount: { $size: "$participantsTemp" },
          }
        },
        {
          $project: {
            participantsTemp: 0,
          },
        },
        {
          $addFields: {
            creatorId: { $toObjectId: "$creatorId" },
          }
        },
        {
          $lookup: {
            from: "user",
            localField: "creatorId",
            foreignField: "_id",
            as: "creator",
            pipeline: [
              {
                $addFields: {
                  _id: { $toString: "$_id" },
                  id: { $toString: "$_id" },
                },
              },
              {
                $project: {
                  _id: 1,
                  id: 1,
                  username: 1,
                  displayName: 1,
                  discriminator: 1,
                  avatar: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: '$creator',
        },
        {
          $addFields: {
            creatorId: {$toString: "$creatorId"},
            gameIds: {
              $map: {
                input: "$gameIds",
                as: "gid",
                in: {$toObjectId: "$$gid"}
              }
            },
            lairIds: {
              $map: {
                input: "$lairIds",
                as: "lid",
                in: {$toObjectId: "$$lid"}
              }
            }
          }
        },
        {
          $lookup: {
            from: 'games',
            localField: 'gameIds',
            foreignField: '_id',
            as: 'games',
            pipeline: [
              {
                $addFields: {
                  _id: { $toString: "$_id" },
                  id: { $toString: "$_id" },
                }
              },
              {
                $project: {
                  _id: 1,
                  id: 1,
                  name: 1,
                  slug: 1,
                  icon: 1,
                },
              },
            ],
          }
        },
        {
          $lookup: {
            from: 'lairs',
            localField: 'lairIds',
            foreignField: '_id',
            as: 'lairs',
            pipeline: [
              {
                $addFields: {
                  _id: { $toString: "$_id" },
                  id: { $toString: "$_id" },
                }
              },
              {
                $project: {
                  id: 1,
                  _id: 1,
                  name: 1,
                },
              },
            ],
          }
        }
      ]).next();

    if (!doc) {
      return null;
    }

    const matches = await getLeagueMatches(id);
    return toLeague(doc, true, matches);
  } catch {
    return null;
  }
}

// Récupérer une ligue par son code d'invitation
export async function getLeagueByInvitationCode(
  code: string
): Promise<League | null> {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({invitationCode: code});

  if (!doc) {
    return null;
  }

  const matches = await getLeagueMatches(doc._id.toString());
  return toLeague(doc, true, matches);
}

// Mettre à jour une ligue
export async function updateLeague(
  id: string,
  input: UpdateLeagueInput
): Promise<League | null> {
  const updateData = {
    ...input,
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    {_id: new ObjectId(id)},
    {$set: updateData},
    {returnDocument: "after"}
  );
  if (!result) {
    return null;
  }

  const matches = await getLeagueMatches(id);
  return toLeague(result, true, matches);
}

// Supprimer une ligue
export async function deleteLeague(id: string): Promise<boolean> {
  // Supprimer tous les matchs de la ligue
  await db.collection("matches").deleteMany({
    matchType: 'league',
    leagueId: id,
  });

  const result = await db
    .collection(COLLECTION_NAME)
    .deleteOne({_id: new ObjectId(id)});
  return result.deletedCount === 1;
}

// Rechercher des ligues avec pagination
export async function searchLeagues(
  options: SearchLeaguesOptions
): Promise<PaginatedLeaguesResult> {
  const {
    search,
    status,
    format,
    gameIds,
    creatorId,
    participantId,
    isPublic,
    page = 1,
    limit = 10,
  } = options;

  const filter: Filter<Document> = {};

  // Filtrer par visibilité
  if (isPublic !== undefined) {
    filter.isPublic = isPublic;
  }

  // Recherche textuelle
  if (search) {
    filter.$or = [
      {name: {$regex: search, $options: "i"}},
      {description: {$regex: search, $options: "i"}},
    ];
  }

  // Filtrer par statut
  if (status) {
    if (Array.isArray(status)) {
      filter.status = {$in: status};
    } else {
      filter.status = status;
    }
  }

  // Filtrer par format
  if (format) {
    filter.format = format;
  }

  // Filtrer par jeux
  if (gameIds && gameIds.length > 0) {
    filter.gameIds = {$in: gameIds};
  }

  // Filtrer par créateur
  if (creatorId) {
    filter.creatorId = creatorId;
  }

  // Filtrer par participant
  if (participantId) {
    // On doit chercher dans la collection participants
    const participantLeagueIds = await db.collection(PARTICIPANTS_COLLECTION)
      .find({ userId: participantId })
      .project({ leagueId: 1 })
      .toArray();

    const leagueIds = participantLeagueIds.map(p => p.leagueId);
    filter._id = { $in: leagueIds };
  }

  const skip = (page - 1) * limit;

  const [leagueDocs, total] = await Promise.all([
    db
      .collection(COLLECTION_NAME)
      .find(filter)
      .sort({createdAt: -1})
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION_NAME).countDocuments(filter),
  ]);

  // Compter les participants pour chaque ligue
  const leaguesWithCounts = await Promise.all(
    leagueDocs.map(async (doc) => {
      const participantsCount = await db.collection(PARTICIPANTS_COLLECTION)
        .countDocuments({ leagueId: doc._id });
      return { ...doc, participantsCount };
    })
  );

  return {
    leagues: await Promise.all(leaguesWithCounts.map(doc => toLeague(doc, false))),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getLeagueParticipant(leagueId: League['id'], userId: User['id']): Promise<LeagueParticipant | null> {
  const participantDoc = await db.collection(PARTICIPANTS_COLLECTION).findOne({
    leagueId: new ObjectId(leagueId),
    userId: userId,
  });

  if (!participantDoc) {
    return null;
  }

  // Récupérer les hauts faits du participant
  const featDocs = await db.collection(FEATS_COLLECTION)
    .find({
      leagueId: new ObjectId(leagueId),
      userId: userId
    })
    .toArray();

  return {
    userId: participantDoc.userId,
    points: participantDoc.points,
    pointsHistory: (participantDoc.pointsHistory || []).map((h: PointHistoryEntry) => ({
      ...h,
      date: new Date(h.date),
    })),
    feats: featDocs.map((f) => ({
      featId: f.featId,
      earnedAt: new Date(f.earnedAt),
      eventId: f.eventId,
      matchId: f.matchId,
    })),
    joinedAt: new Date(participantDoc.joinedAt),
    eliminatedAt: participantDoc.eliminatedAt ? new Date(participantDoc.eliminatedAt) : undefined,
    eliminatedBy: participantDoc.eliminatedBy,
    isEliminated: participantDoc.isEliminated,
  };
}

export async function getLeagueParticipantManageDetails(
  leagueId: League["id"],
  userId: User["id"]
): Promise<LeagueParticipantManageDetails> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  const participantDoc = await db.collection(PARTICIPANTS_COLLECTION).findOne({
    leagueId: new ObjectId(leagueId),
    userId,
  });

  if (!participantDoc) {
    throw new Error("Participant non trouvé");
  }

  const featRulesById = new Map(
    (league.pointsConfig?.pointsRules.feats || []).map((feat) => [feat.id, feat] as const)
  );

  const featDocs = await db
    .collection(FEATS_COLLECTION)
    .find({
      leagueId: new ObjectId(leagueId),
      userId,
    })
    .sort({ earnedAt: -1 })
    .toArray();

  const feats: LeagueParticipantManageFeat[] = featDocs.map((featDoc) => {
    const featRule = featRulesById.get(featDoc.featId);
    return {
      id: featDoc._id.toString(),
      featId: featDoc.featId,
      title: featRule?.title || featDoc.featId,
      points: featRule?.points || 0,
      earnedAt: new Date(featDoc.earnedAt),
      eventId: featDoc.eventId,
      matchId: featDoc.matchId,
    };
  });

  type ManualPointCandidate = {
    historyIndex: number;
    date: Date;
    points: number;
    reason: string;
    eventId?: string;
    featId?: string;
    matchId?: string;
  };

  const participantPointsHistory: PointHistoryEntry[] =
    participantDoc.pointsHistory || [];

  const manualPointCandidates: ManualPointCandidate[] =
    participantPointsHistory.map(
      (entry: PointHistoryEntry, historyIndex: number) => ({
        historyIndex,
        date: new Date(entry.date),
        points: entry.points,
        reason: entry.reason,
        eventId: entry.eventId,
        featId: entry.featId,
        matchId: entry.matchId,
      })
    );

  const manualPoints: LeagueParticipantManualPointEntry[] = manualPointCandidates
    .filter((entry: ManualPointCandidate) => !entry.featId && !entry.matchId)
    .map((entry: ManualPointCandidate) => ({
      historyIndex: entry.historyIndex,
      date: entry.date,
      points: entry.points,
      reason: entry.reason,
      eventId: entry.eventId,
    }))
    .sort(
      (a: LeagueParticipantManualPointEntry, b: LeagueParticipantManualPointEntry) =>
        DateTime.fromJSDate(b.date).toMillis() -
        DateTime.fromJSDate(a.date).toMillis()
    );

  return {
    feats,
    manualPoints,
  };
}

export async function deleteLeagueParticipantFeat(
  leagueId: League["id"],
  userId: User["id"],
  participantFeatId: string
): Promise<void> {
  let featObjectId: ObjectId;
  try {
    featObjectId = new ObjectId(participantFeatId);
  } catch {
    throw new Error("Identifiant de haut fait invalide");
  }

  const featDoc = await db.collection(FEATS_COLLECTION).findOne<LeagueParticipantFeatDocument>({
    _id: featObjectId,
    leagueId: new ObjectId(leagueId),
    userId,
  });

  if (!featDoc) {
    throw new Error("Haut fait non trouvé");
  }

  const participantDoc = await db.collection(PARTICIPANTS_COLLECTION).findOne({
    leagueId: new ObjectId(leagueId),
    userId,
  });

  if (!participantDoc) {
    throw new Error("Participant non trouvé");
  }

  const pointsHistory: PointHistoryEntry[] = (participantDoc.pointsHistory || []).map(
    (entry: PointHistoryEntry) => ({
      ...entry,
      date: new Date(entry.date),
    })
  );

  const earnedAtMillis = DateTime.fromJSDate(new Date(featDoc.earnedAt)).toMillis();

  let historyIndex = pointsHistory.findIndex((entry: PointHistoryEntry) => {
    if (entry.featId !== featDoc.featId) {
      return false;
    }

    if ((entry.matchId || undefined) !== (featDoc.matchId || undefined)) {
      return false;
    }

    if ((entry.eventId || undefined) !== (featDoc.eventId || undefined)) {
      return false;
    }

    return DateTime.fromJSDate(new Date(entry.date)).toMillis() === earnedAtMillis;
  });

  if (historyIndex < 0) {
    historyIndex = pointsHistory.findIndex((entry: PointHistoryEntry) => {
      if (entry.featId !== featDoc.featId) {
        return false;
      }

      if ((entry.matchId || undefined) !== (featDoc.matchId || undefined)) {
        return false;
      }

      if ((entry.eventId || undefined) !== (featDoc.eventId || undefined)) {
        return false;
      }

      return true;
    });
  }

  const updatedHistory =
    historyIndex >= 0
      ? pointsHistory.filter((_: PointHistoryEntry, index: number) => index !== historyIndex)
      : pointsHistory;

  const totalPoints = updatedHistory.reduce((sum: number, entry: PointHistoryEntry) => {
    const safePoints = Number.isFinite(entry.points) ? entry.points : 0;
    return sum + safePoints;
  }, 0);

  await db.collection(PARTICIPANTS_COLLECTION).updateOne(
    { leagueId: new ObjectId(leagueId), userId },
    {
      $set: {
        points: totalPoints,
        pointsHistory: updatedHistory,
      },
    } as Document
  );

  await db.collection(FEATS_COLLECTION).deleteOne({
    _id: featObjectId,
    leagueId: new ObjectId(leagueId),
    userId,
  });

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: DateTime.now().toJSDate() } }
  );
}

export async function deleteLeagueParticipantManualPointsEntry(
  leagueId: League["id"],
  userId: User["id"],
  historyIndex: number
): Promise<void> {
  if (!Number.isInteger(historyIndex) || historyIndex < 0) {
    throw new Error("Index de points manuel invalide");
  }

  const participantDoc = await db.collection(PARTICIPANTS_COLLECTION).findOne({
    leagueId: new ObjectId(leagueId),
    userId,
  });

  if (!participantDoc) {
    throw new Error("Participant non trouvé");
  }

  const pointsHistory: PointHistoryEntry[] = (participantDoc.pointsHistory || []).map(
    (entry: PointHistoryEntry) => ({
      ...entry,
      date: new Date(entry.date),
    })
  );

  if (historyIndex >= pointsHistory.length) {
    throw new Error("Entrée de points manuelle introuvable");
  }

  const targetEntry = pointsHistory[historyIndex];
  if (targetEntry.matchId || targetEntry.featId) {
    throw new Error("Seuls les ajouts manuels de points peuvent être supprimés ici");
  }

  const updatedHistory = pointsHistory.filter(
    (_: PointHistoryEntry, index: number) => index !== historyIndex
  );
  const totalPoints = updatedHistory.reduce((sum: number, entry: PointHistoryEntry) => {
    const safePoints = Number.isFinite(entry.points) ? entry.points : 0;
    return sum + safePoints;
  }, 0);

  await db.collection(PARTICIPANTS_COLLECTION).updateOne(
    { leagueId: new ObjectId(leagueId), userId },
    {
      $set: {
        points: totalPoints,
        pointsHistory: updatedHistory,
      },
    } as Document
  );

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: DateTime.now().toJSDate() } }
  );
}

// Ajouter un participant à une ligue
export async function addParticipant(
  leagueId: string,
  userId: string
): Promise<League | null> {
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  // Vérifier si l'utilisateur est déjà inscrit
  const existingParticipant = await db.collection(PARTICIPANTS_COLLECTION).findOne({
    leagueId: new ObjectId(leagueId),
    userId: userId,
  });

  if (existingParticipant) {
    return league;
  }

  // Vérifier le nombre maximum de participants
  if (
    league.maxParticipants &&
    league.participantsCount &&
    league.participantsCount >= league.maxParticipants
  ) {
    throw new Error("La ligue a atteint le nombre maximum de participants");
  }

  const newParticipant: Omit<LeagueParticipantDocument, "_id"> = {
    leagueId: new ObjectId(leagueId),
    userId,
    points: 0,
    pointsHistory: [],
    joinedAt: new Date(),
  };

  await db.collection(PARTICIPANTS_COLLECTION).insertOne(newParticipant as Document);
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return getLeagueById(leagueId);
}

// Retirer un participant d'une ligue
export async function removeParticipant(
  leagueId: string,
  userId: string
): Promise<League | null> {
  // Supprimer le participant
  await db.collection(PARTICIPANTS_COLLECTION).deleteOne({
    leagueId: new ObjectId(leagueId),
    userId: userId,
  });

  // Supprimer tous ses hauts faits
  await db.collection(FEATS_COLLECTION).deleteMany({
    leagueId: new ObjectId(leagueId),
    userId: userId,
  });

  // Mettre à jour la ligue
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return getLeagueById(leagueId);
}

// Ajouter des points à un participant
export async function addPointsToParticipant(
  leagueId: string,
  userId: string,
  points: number,
  reason: string,
  eventId?: string,
  featId?: string
): Promise<League | null> {
  const participant = await getLeagueParticipant(leagueId, userId);
  if (!participant) return null;

  const historyEntry = {
    date: new Date(),
    points,
    reason,
    eventId,
    featId,
  };

  await db.collection(PARTICIPANTS_COLLECTION).updateOne(
    { leagueId: new ObjectId(leagueId), userId: userId },
    {
      $inc: { points: points },
      $push: { pointsHistory: historyEntry },
    } as Document
  );

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return getLeagueById(leagueId);
}

// Attribuer un haut fait à un participant
export async function awardFeatToParticipant(
  leagueId: string,
  userId: string,
  featId: string,
  eventId?: string
): Promise<League | null> {
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  const participant = await getLeagueParticipant(leagueId, userId);
  if (!participant) return null;

  // Vérifier si le haut fait existe dans la configuration
  const feat = league.pointsConfig?.pointsRules.feats.find(
    (f) => f.id === featId
  );
  if (!feat) return null;

  // Vérifier les limites du haut fait
  const featCount = participant.feats.filter((f) => f.featId === featId).length;

  if (feat.maxPerLeague && featCount >= feat.maxPerLeague) {
    throw new Error("Limite de ce haut fait atteinte pour la ligue");
  }

  const now = new Date();

  // Ajouter le haut fait dans la collection dédiée
  const featDoc: Omit<LeagueParticipantFeatDocument, "_id"> = {
    leagueId: new ObjectId(leagueId),
    userId: userId,
    featId,
    earnedAt: now,
    eventId,
    createdAt: now,
  };

  await db.collection(FEATS_COLLECTION).insertOne(featDoc as Document);

  // Ajouter les points associés
  const historyEntry = {
    date: now,
    points: feat.points,
    reason: `Haut fait: ${feat.title}`,
    eventId,
    featId,
  };

  await db.collection(PARTICIPANTS_COLLECTION).updateOne(
    { leagueId: new ObjectId(leagueId), userId: userId },
    {
      $inc: { points: feat.points },
      $push: { pointsHistory: historyEntry },
    } as Document
  );

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return getLeagueById(leagueId);
}

// Recalculer tous les points des participants d'une ligue POINTS
export async function recalculateLeaguePoints(
  leagueId: string
): Promise<League | null> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    return null;
  }

  if (league.format !== "POINTS" || !league.pointsConfig) {
    throw new Error("Cette ligue n'est pas au format POINTS");
  }

  const { pointsRules } = league.pointsConfig;
  const featRulesById = new Map(
    pointsRules.feats.map((feat) => [feat.id, feat] as const)
  );
  const participantIds = new Set(
    league.participants.map((participant) => participant.userId)
  );

  const historiesByUser = new Map<string, PointHistoryEntry[]>();
  const featCountsByUser = new Map<string, Map<string, number>>();

  for (const participant of league.participants) {
    const preservedEntries = participant.pointsHistory
      .filter((entry) => {
        if (entry.matchId) {
          return false;
        }

        if (!entry.featId) {
          return true;
        }

        return featRulesById.has(entry.featId);
      })
      .map((entry) => ({
        ...entry,
        date: DateTime.fromJSDate(entry.date).toJSDate(),
      }));

    historiesByUser.set(participant.userId, preservedEntries);

    const manualFeatCounts = new Map<string, number>();
    for (const feat of participant.feats) {
      if (feat.matchId) {
        continue;
      }

      if (!featRulesById.has(feat.featId)) {
        continue;
      }

      const currentCount = manualFeatCounts.get(feat.featId) || 0;
      manualFeatCounts.set(feat.featId, currentCount + 1);
    }

    featCountsByUser.set(participant.userId, manualFeatCounts);
  }

  const pointsMatches = (league.matches || [])
    .filter(
      (match) =>
        match.matchType === "league" &&
        !match.isKillerMatch &&
        (match.status === "CONFIRMED" || typeof match.status === "undefined")
    )
    .sort(
      (a, b) =>
        DateTime.fromJSDate(a.playedAt).toMillis() -
        DateTime.fromJSDate(b.playedAt).toMillis()
    );

  for (const match of pointsMatches) {
    const matchDate = DateTime.fromJSDate(match.playedAt).toJSDate();

    for (const playerId of match.playerIds) {
      if (!participantIds.has(playerId)) {
        continue;
      }

      const isWinner = match.winnerIds.includes(playerId);
      const points =
        pointsRules.participation +
        (isWinner ? pointsRules.victory : pointsRules.defeat);

      const userHistory = historiesByUser.get(playerId) || [];
      userHistory.push({
        date: matchDate,
        points,
        reason: isWinner ? "Victoire" : "Défaite",
        matchId: match.id,
      });
      historiesByUser.set(playerId, userHistory);
    }

    if (!match.featAwards || match.featAwards.length === 0) {
      continue;
    }

    const perMatchFeatCounts = new Map<string, number>();

    for (const featAward of match.featAwards) {
      if (featAward.pointsCounted === false) {
        continue;
      }

      if (!participantIds.has(featAward.playerId)) {
        continue;
      }

      const featRule = featRulesById.get(featAward.featId);
      if (!featRule) {
        continue;
      }

      const perMatchKey = `${featAward.playerId}:${featAward.featId}`;
      const countInCurrentMatch = perMatchFeatCounts.get(perMatchKey) || 0;
      if (
        featRule.maxPerEvent !== undefined &&
        countInCurrentMatch >= featRule.maxPerEvent
      ) {
        continue;
      }

      const userFeatCounts =
        featCountsByUser.get(featAward.playerId) || new Map<string, number>();
      const countInLeague = userFeatCounts.get(featAward.featId) || 0;
      if (featRule.maxPerLeague !== undefined && countInLeague >= featRule.maxPerLeague) {
        continue;
      }

      const userHistory = historiesByUser.get(featAward.playerId) || [];
      userHistory.push({
        date: matchDate,
        points: featRule.points,
        reason: `Haut fait: ${featRule.title}`,
        featId: featAward.featId,
        matchId: match.id,
      });
      historiesByUser.set(featAward.playerId, userHistory);

      userFeatCounts.set(featAward.featId, countInLeague + 1);
      featCountsByUser.set(featAward.playerId, userFeatCounts);
      perMatchFeatCounts.set(perMatchKey, countInCurrentMatch + 1);
    }
  }

  await Promise.all(
    league.participants.map(async (participant) => {
      const rebuiltHistory = (historiesByUser.get(participant.userId) || []).sort(
        (a, b) =>
          DateTime.fromJSDate(a.date).toMillis() -
          DateTime.fromJSDate(b.date).toMillis()
      );

      const totalPoints = rebuiltHistory.reduce(
        (sum, entry) => sum + entry.points,
        0
      );

      await db.collection(PARTICIPANTS_COLLECTION).updateOne(
        { leagueId: new ObjectId(leagueId), userId: participant.userId },
        {
          $set: {
            points: totalPoints,
            pointsHistory: rebuiltHistory,
          },
        } as Document
      );
    })
  );

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: DateTime.now().toJSDate() } }
  );

  return getLeagueById(leagueId);
}

// Obtenir le classement d'une ligue
export async function getLeagueRanking(
  leagueId: string
): Promise<(LeagueParticipant & {
  rank: number;
  wins?: number;
  losses?: number;
  ratio?: number;
  user?: { id: string; discriminator?: string; displayName?: string; avatar?: string; username: string }
})[]> {
  const league = await getLeagueById(leagueId);
  if (!league) return [];

  if (league.format === "KILLER") {
    const sortedParticipants = await db.collection(PARTICIPANTS_COLLECTION).aggregate<{
      userId: string;
      points: number;
      pointsHistory: Array<{
        date: Date;
        points: number;
        reason: string;
        eventId?: string;
        featId?: string;
        matchId?: string;
      }>;
      feats: Array<{
        featId: string;
        earnedAt: Date;
        eventId?: string;
        matchId?: string;
      }>;
      joinedAt: Date;
      eliminatedAt?: Date;
      wins: number;
      losses: number;
      ratio: number;
    }>([
      { $match: { leagueId: new ObjectId(leagueId) } },
      {
        $addFields: {
          userObjectId: { $toObjectId: "$userId" },
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "userObjectId",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $project: {
                _id: 1,
                username: 1,
                displayName: 1,
                discriminator: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "matches",
          let: { participantId: "$userId", leagueId: "$leagueId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$matchType", "league"] },
                    { $eq: ["$leagueId", { $toString: "$$leagueId" }] },
                    { $eq: ["$status", "CONFIRMED"] },
                    { $in: ["$$participantId", "$playerIds"] },
                  ],
                },
              },
            },
            {
              $project: {
                playerIds: 1,
                winnerIds: 1,
              },
            },
          ],
          as: "killerMatches",
        },
      },
      {
        $addFields: {
          wins: {
            $size: {
              $filter: {
                input: "$killerMatches",
                as: "match",
                cond: { $in: ["$userId", "$$match.winnerIds"] },
              },
            },
          },
          losses: {
            $size: {
              $filter: {
                input: "$killerMatches",
                as: "match",
                cond: {
                  $and: [
                    { $gt: [{ $size: "$$match.winnerIds" }, 0] },
                    { $not: { $in: ["$userId", "$$match.winnerIds"] } },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          ratio: {
            $add: [
              { $multiply: ["$wins", 1] },
              { $multiply: ["$losses", -1] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: FEATS_COLLECTION,
          let: { userId: { $toString: "$userObjectId" }, leagueId: "$leagueId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$leagueId", "$$leagueId"] },
                  ],
                },
              },
            },
          ],
          as: "feats",
        },
      },
      {
        $addFields: {
          userId: { $toString: "$userObjectId" },
          "user.id": { $toString: "$user._id" },
          feats: {
            $map: {
              input: "$feats",
              as: "feat",
              in: {
                featId: "$$feat.featId",
                earnedAt: "$$feat.earnedAt",
                eventId: "$$feat.eventId",
                matchId: "$$feat.matchId",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          "user._id": 0,
          leagueId: 0,
          userObjectId: 0,
          killerMatches: 0,
        },
      },
      { $sort: { ratio: -1, wins: -1, joinedAt: 1 } },
    ]).limit(100).toArray();

    return sortedParticipants.map((participant, index) => ({
      ...participant,
      rank: index + 1,
    }));
  }

  const sortedParticipants = await db.collection(PARTICIPANTS_COLLECTION).aggregate<{
    userId: string;
    points: number;
    pointsHistory: Array<{
      date: Date;
      points: number;
      reason: string;
      eventId?: string;
      featId?: string;
      matchId?: string;
    }>;
    feats: Array<{
      featId: string;
      earnedAt: Date;
      eventId?: string;
      matchId?: string;
    }>;
    joinedAt: Date;
    eliminatedAt?: Date;
  }>([
    { $match: { leagueId: new ObjectId(leagueId) } },
    { $sort: { points: -1, joinedAt: 1 } },
    {
      $addFields: {
        userId: { $toObjectId: "$userId" },
      },
    },
    {
      $lookup: {
        from: "user",
        localField: "userId",
        foreignField: "_id",
        as: "user",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              displayName: 1,
              discriminator: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$user",
    },
    {
      $lookup: {
        from: FEATS_COLLECTION,
        let: { userId: { $toString: "$userId" }, leagueId: "$leagueId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$userId"] },
                  { $eq: ["$leagueId", "$$leagueId"] }
                ]
              }
            }
          }
        ],
        as: "feats",
      },
    },
    {
      $addFields: {
        'userId': { $toString: "$userId" },
        'user.id': { $toString: "$user._id" },
        'feats': {
          $map: {
            input: "$feats",
            as: "feat",
            in: {
              featId: "$$feat.featId",
              earnedAt: "$$feat.earnedAt",
              eventId: "$$feat.eventId",
              matchId: "$$feat.matchId",
            }
          }
        }
      },
    },
    {
      $project: {
        _id: 0,
        "user._id": 0,
        leagueId: 0,
      },
    }
  ]).limit(100).toArray();

  return sortedParticipants.map((participant, index) => ({
    ...participant,
    rank: index + 1,
  }));
}

// Vérifier si un utilisateur est organisateur ou créateur d'une ligue
export async function isLeagueOrganizer(
  leagueId: string,
  userId: string
): Promise<boolean> {
  const league = await getLeagueById(leagueId);
  if (!league) return false;

  return (
    league.creatorId === userId || league.organizerIds.includes(userId)
  );
}

// Récupérer les ligues d'un utilisateur (créées ou participées)
export async function getUserLeagues(
  userId: string,
  options: { page?: number; limit?: number } = {}
): Promise<PaginatedLeaguesResult> {
  const {page = 1, limit = 10} = options;

  // Récupérer les IDs des ligues avec lesquelles l'utilisateur est participant
  const participantLeagueIds = await db.collection(PARTICIPANTS_COLLECTION)
    .find({ userId: userId })
    .project({ leagueId: 1 })
    .toArray();

  const filter: Filter<Document> = {
    $or: [
      {creatorId: userId},
      {organizerIds: userId},
      { _id: { $in: participantLeagueIds.map(p => p.leagueId) } },
    ],
  };

  const skip = (page - 1) * limit;

  const [leagues, total] = await Promise.all([
    db
      .collection(COLLECTION_NAME)
      .find(filter)
      .sort({updatedAt: -1})
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION_NAME).countDocuments(filter),
  ]);

  return {
    leagues: await Promise.all(leagues.map(doc => toLeague(doc))),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export type ReportPointsLeagueMatchInput = {
  gameId: string;
  playedAt: Date;
  playerIds: string[];
  winnerIds: string[];
  lairId?: string;
  lairName?: string;
  notes?: string;
};

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

async function applyConfirmedPointsForMatch(
  leagueId: string,
  league: League,
  match: LeagueMatch
): Promise<void> {
  if (league.format !== "POINTS" || !league.pointsConfig) {
    return;
  }

  const matchDate = match.playedAt ? new Date(match.playedAt) : new Date();
  const { pointsRules } = league.pointsConfig;

  for (const playerId of match.playerIds) {
    const isWinner = match.winnerIds.includes(playerId);
    const points =
      pointsRules.participation +
      (isWinner ? pointsRules.victory : pointsRules.defeat);

    const historyEntry = {
      date: matchDate,
      points,
      reason: isWinner ? "Victoire" : "Défaite",
      matchId: match.id,
    };

    await db.collection(PARTICIPANTS_COLLECTION).updateOne(
      { leagueId: new ObjectId(leagueId), userId: playerId },
      {
        $inc: { points },
        $push: { pointsHistory: historyEntry },
      } as Document
    );
  }
}

async function tryFinalizePointsMatch(
  leagueId: string,
  matchId: string,
  actorUserId?: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league || league.format !== "POINTS") {
    return;
  }

  const match = league.matches.find((item) => item.id === matchId);
  if (!match || match.matchType !== "league" || match.isKillerMatch) {
    return;
  }

  if (match.status === "CONFIRMED") {
    return;
  }

  const confirmedPlayerIds = dedupeIds(match.confirmedPlayerIds || []);
  const allPlayersConfirmed = match.playerIds.every((playerId) =>
    confirmedPlayerIds.includes(playerId)
  );

  const requireLairConfirmation = league.lairIds.length > 0;
  const lairConfirmed = !requireLairConfirmation || !!match.lairConfirmedBy;

  if (!allPlayersConfirmed || !lairConfirmed) {
    return;
  }

  const now = new Date();

  const finalizeResult = await db.collection("matches").updateOne(
    {
      matchType: "league",
      leagueId,
      _id: new ObjectId(match.id),
      status: { $ne: "CONFIRMED" },
    },
    {
      $set: {
        status: "CONFIRMED",
        confirmedAt: now,
        confirmedBy: actorUserId || match.confirmedBy || match.reportedBy || match.createdBy,
        confirmedPlayerIds: dedupeIds(match.playerIds),
      },
    }
  );

  // Idempotence: seule la transition REPORTED -> CONFIRMED déclenche le calcul des points.
  if (finalizeResult.modifiedCount === 0) {
    return;
  }

  await applyConfirmedPointsForMatch(leagueId, league, match);

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: now } }
  );
}

// Ajouter un match à une ligue et mettre à jour les points des participants
export async function addLeagueMatch(
  leagueId: string,
  matchInput: CreateLeagueMatchInput,
  createdBy: string
): Promise<League | null> {
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  // Vérifier que tous les joueurs sont des participants de la ligue
  const participantIds = league.participants.map((p) => p.userId);
  const allPlayersAreParticipants = matchInput.playerIds.every((playerId) =>
    participantIds.includes(playerId)
  );
  if (!allPlayersAreParticipants) {
    throw new Error("Tous les joueurs doivent être des participants de la ligue");
  }

  // Vérifier que tous les gagnants font partie des joueurs du match
  const normalizedScores = matchInput.playerScores
    ? matchInput.playerIds.reduce<Record<string, number>>((acc, playerId) => {
        const rawScore = matchInput.playerScores?.[playerId];
        const safeScore = Number.isFinite(rawScore)
          ? Math.max(0, Math.floor(rawScore as number))
          : 0;
        acc[playerId] = safeScore;
        return acc;
      }, {})
    : undefined;

  const computedWinnerIds = normalizedScores
    ? (() => {
        const scores = Object.values(normalizedScores);
        if (scores.length === 0) return [];
        const maxScore = Math.max(...scores);
        return matchInput.playerIds.filter(
          (playerId) => normalizedScores[playerId] === maxScore
        );
      })()
    : matchInput.winnerIds;

  const allWinnersArePlayers = computedWinnerIds.every((winnerId) =>
    matchInput.playerIds.includes(winnerId)
  );
  if (!allWinnersArePlayers) {
    throw new Error("Les gagnants doivent faire partie des joueurs du match");
  }

  // Créer le match
  const matchId = nanoid(12);

  // Préparer les featAwards avec l'information de comptabilisation
  const processedFeatAwards: MatchFeatAward[] = [];

  // Préparer les mises à jour de points pour chaque participant du match
  const pointsUpdates: Array<{
    userId: string;
    points: number;
    reason: string;
  }> = [];

  if (league.format === "POINTS" && league.pointsConfig) {
    const {pointsRules} = league.pointsConfig;
    const matchDate = new Date();

    for (const playerId of matchInput.playerIds) {
      const isWinner = computedWinnerIds.includes(playerId);
      let points = pointsRules.participation;

      if (isWinner) {
        points += pointsRules.victory;
      } else {
        points += pointsRules.defeat;
      }

      pointsUpdates.push({
        userId: playerId,
        points,
        reason: isWinner ? "Victoire" : "Défaite",
      });
    }

    // Mettre à jour les points de chaque participant
    for (const update of pointsUpdates) {
      const historyEntry = {
        date: matchDate,
        points: update.points,
        reason: update.reason,
        matchId,
      };

      await db.collection(PARTICIPANTS_COLLECTION).updateOne(
        { leagueId: new ObjectId(leagueId), userId: update.userId },
        {
          $inc: { points: update.points },
          $push: { pointsHistory: historyEntry },
        } as Document
      );
    }

    // Attribuer les hauts faits du match
    if (matchInput.featAwards && matchInput.featAwards.length > 0) {
      for (const featAward of matchInput.featAwards) {
        const participant = await getLeagueParticipant(leagueId, featAward.playerId);
        if (!participant) {
          // Joueur non trouvé, on ajoute quand même le feat mais sans points
          processedFeatAwards.push({
            ...featAward,
            pointsCounted: false,
          });
          continue;
        }

        const feat = pointsRules.feats.find((f) => f.id === featAward.featId);
        if (!feat) {
          // Haut fait non trouvé, on l'ajoute sans points
          processedFeatAwards.push({
            ...featAward,
            pointsCounted: false,
          });
          continue;
        }

        // Compter combien de fois ce joueur a déjà obtenu ce haut fait dans la ligue
        const existingFeatCount = participant.feats.filter(
          (f) => f.featId === featAward.featId
        ).length;

        // Compter combien de fois ce haut fait est attribué dans CE match pour ce joueur
        // (pour gérer les doublons dans le même match)
        const featCountInThisMatch = processedFeatAwards.filter(
          (fa) => fa.playerId === featAward.playerId &&
            fa.featId === featAward.featId &&
            fa.pointsCounted === true
        ).length;

        const totalFeatCount = existingFeatCount + featCountInThisMatch;

        // Vérifier la limite par ligue
        const limitReached = feat.maxPerLeague !== undefined &&
          totalFeatCount >= feat.maxPerLeague;

        if (limitReached) {
          // Limite atteinte, on enregistre le haut fait mais sans points
          processedFeatAwards.push({
            ...featAward,
            pointsCounted: false,
          });
        } else {
          // On peut attribuer les points
          processedFeatAwards.push({
            ...featAward,
            pointsCounted: true,
          });

          // Ajouter le haut fait dans la collection dédiée
          const featDoc: Omit<LeagueParticipantFeatDocument, "_id"> = {
            leagueId: new ObjectId(leagueId),
            userId: featAward.playerId,
            featId: featAward.featId,
            earnedAt: matchDate,
            matchId,
            createdAt: matchDate,
          };

          await db.collection(FEATS_COLLECTION).insertOne(featDoc as Document);

          // Ajouter les points dans l'historique
          const featHistoryEntry = {
            date: matchDate,
            points: feat.points,
            reason: `Haut fait: ${feat.title}`,
            featId: featAward.featId,
            matchId,
          };

          await db.collection(PARTICIPANTS_COLLECTION).updateOne(
            { leagueId: new ObjectId(leagueId), userId: featAward.playerId },
            {
              $inc: { points: feat.points },
              $push: { pointsHistory: featHistoryEntry },
            } as Document
          );
        }
      }
    }
  } else if (matchInput.featAwards) {
    // Si pas en mode POINTS, on ajoute tous les feats sans comptabilisation
    for (const featAward of matchInput.featAwards) {
      processedFeatAwards.push({
        ...featAward,
        pointsCounted: false,
      });
    }
  }

  // Créer le match avec les featAwards traités
  const newMatch: Omit<LeagueTypeMatch, "id" | "createdAt"> = {
    matchType: 'league',
    leagueId,
    gameId: matchInput.gameId,
    playedAt: matchInput.playedAt,
    playerIds: matchInput.playerIds,
    playerScores: normalizedScores,
    winnerIds: computedWinnerIds,
    featAwards: processedFeatAwards.length > 0 ? processedFeatAwards : undefined,
    createdBy,
    notes: matchInput.notes,
    decks: matchInput.decks,
  };

  await createMatch(newMatch);

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return getLeagueById(leagueId);
}

// Récupérer les matchs d'une ligue
export async function getLeagueMatches(leagueId: string): Promise<LeagueMatch[]> {
  const matchesRaw = await db.collection('matches')
    .aggregate<LeagueMatch>([
      {
        $match: {
          matchType: 'league',
          leagueId,
        },
      },
      {
        $lookup: {
          from: 'lairs',
          localField: 'lairId',
          foreignField: '_id',
          as: 'lair',
          pipeline: [
            {
              $project: {
                _id: 1,
                id: { $toString: "$_id" },
                name: 1,
              },
            },
          ],
        }
      },
      {
        $addFields: {
          lairName: { $arrayElemAt: ["$lair.name", 0] },
          id: { $toString: "$_id" },
        }
      },
      {
        $project: {
          lair: 0,
          _id: 0,
        },
      },
    ])
    .toArray();
  
  return matchesRaw;
}

// Supprimer un match d'une ligue (annule aussi les points attribués)
export async function deleteLeagueMatch(
  leagueId: string,
  matchId: string
): Promise<League | null> {
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  const matches = await getMatches({ matchType: 'league', leagueId });
  const match = matches.find(m => m.id === matchId);
  if (!match || match.matchType !== 'league') return null;

  // Annuler les points et hauts faits attribués pour ce match
  if (league.format === "POINTS" && league.pointsConfig) {
    for (const playerId of match.playerIds) {
      const participant = await getLeagueParticipant(leagueId, playerId);
      if (!participant) continue;

      // Calculer les points à retirer (depuis l'historique)
      const matchHistoryEntries = participant.pointsHistory.filter(
        (h) => h.matchId === matchId
      );
      const pointsToRemove = matchHistoryEntries.reduce(
        (sum, entry) => sum + entry.points,
        0
      );

      // Retirer les points et l'historique du participant
      await db.collection(PARTICIPANTS_COLLECTION).updateOne(
        { leagueId: new ObjectId(leagueId), userId: playerId },
        {
          $inc: { points: -pointsToRemove },
          $pull: { pointsHistory: { matchId } },
        } as Document
      );

      // Supprimer les hauts faits liés à ce match
      await db.collection(FEATS_COLLECTION).deleteMany({
        leagueId: new ObjectId(leagueId),
        userId: playerId,
        matchId,
      });
    }
  }

  await deleteMatch(matchId);

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return getLeagueById(leagueId);
}

export async function reportPointsLeagueMatch(
  leagueId: string,
  reporterId: string,
  matchInput: ReportPointsLeagueMatchInput
): Promise<string> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  if (league.format !== "POINTS" || !league.pointsConfig) {
    throw new Error("Cette ligue n'est pas au format POINTS");
  }

  if (league.status === "COMPLETED" || league.status === "CANCELLED") {
    throw new Error("Cette ligue n'accepte plus de nouveaux résultats");
  }

  const playerIds = dedupeIds(matchInput.playerIds);
  const winnerIds = dedupeIds(matchInput.winnerIds);

  if (playerIds.length < 2) {
    throw new Error("Un match doit contenir au moins 2 joueurs");
  }

  if (!playerIds.includes(reporterId)) {
    throw new Error("Vous devez faire partie des joueurs du match");
  }

  if (winnerIds.length === 0) {
    throw new Error("Veuillez sélectionner au moins un vainqueur");
  }

  const participantIds = new Set(league.participants.map((participant) => participant.userId));
  const allPlayersAreParticipants = playerIds.every((playerId) => participantIds.has(playerId));
  if (!allPlayersAreParticipants) {
    throw new Error("Tous les joueurs doivent être inscrits dans la ligue");
  }

  const allWinnersArePlayers = winnerIds.every((winnerId) => playerIds.includes(winnerId));
  if (!allWinnersArePlayers) {
    throw new Error("Tous les vainqueurs doivent faire partie des joueurs du match");
  }

  if (!league.gameIds.includes(matchInput.gameId)) {
    throw new Error("Ce jeu ne fait pas partie des jeux de la ligue");
  }

  const hasPartnerLairs = league.lairIds.length > 0;
  if (hasPartnerLairs && !matchInput.lairId) {
    throw new Error("Le lieu est obligatoire pour cette ligue");
  }

  let selectedLair = null;
  if (matchInput.lairId) {
    if (hasPartnerLairs && !league.lairIds.includes(matchInput.lairId)) {
      throw new Error("Ce lieu ne fait pas partie des lieux partenaires de la ligue");
    }

    selectedLair = await getLairById(matchInput.lairId);
    if (!selectedLair) {
      throw new Error("Lieu introuvable");
    }
  }

  const lairName = selectedLair?.name || matchInput.lairName?.trim() || undefined;
  const now = new Date();

  const newMatch: Omit<LeagueTypeMatch, "id" | "createdAt"> = {
    matchType: "league",
    leagueId,
    gameId: matchInput.gameId,
    playedAt: matchInput.playedAt,
    playerIds,
    winnerIds,
    lairId: selectedLair?.id,
    lairName,
    status: "REPORTED",
    reportedBy: reporterId,
    reportedAt: now,
    confirmedPlayerIds: [reporterId],
    createdBy: reporterId,
    notes: matchInput.notes?.trim() || undefined,
  };

  const createdMatch = await createMatch(newMatch);

  await Promise.all(
    playerIds.map((playerId) =>
      notifyUserWithTemplate(
        playerId,
        "Résultat de match à confirmer",
        `Un résultat de match a été rapporté dans la ligue ${league.name}. Merci de confirmer le résultat.`,
        "league-match-result-confirmation-request",
        leagueId,
        createdMatch.id
      )
    )
  );

  if (hasPartnerLairs && selectedLair?.id) {
    await notifyLairOwnersWithTemplate(
      selectedLair.id,
      "Match à valider",
      `Un match de ligue dans ${league.name} attend une validation du lieu.`,
      "league-match-lair-confirmation-request",
      leagueId,
      createdMatch.id
    );
  }

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: now } }
  );

  await tryFinalizePointsMatch(leagueId, createdMatch.id, reporterId);

  return createdMatch.id;
}

export async function confirmPointsLeagueMatch(
  leagueId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  if (league.format !== "POINTS") {
    throw new Error("Cette ligue n'est pas au format POINTS");
  }

  const match = league.matches.find((item) => item.id === matchId);
  if (!match || match.matchType !== "league" || match.isKillerMatch) {
    throw new Error("Match non trouvé");
  }

  if (match.status === "CONFIRMED") {
    throw new Error("Ce match est déjà confirmé");
  }

  if (match.status !== "REPORTED") {
    throw new Error("Ce match n'est pas en attente de confirmation");
  }

  if (!match.playerIds.includes(userId)) {
    throw new Error("Vous ne faites pas partie de ce match");
  }

  const alreadyConfirmed = (match.confirmedPlayerIds || []).includes(userId);
  if (alreadyConfirmed) {
    throw new Error("Vous avez déjà confirmé ce résultat");
  }

  await db.collection("matches").updateOne(
    {
      matchType: "league",
      leagueId,
      _id: new ObjectId(matchId),
      status: { $ne: "CONFIRMED" },
    },
    {
      $addToSet: { confirmedPlayerIds: userId },
      $set: {
        confirmedBy: userId,
        status: "REPORTED",
        updatedAt: new Date(),
      },
    }
  );

  await tryFinalizePointsMatch(leagueId, matchId, userId);
}

export async function confirmPointsLeagueMatchLair(
  leagueId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  if (league.format !== "POINTS") {
    throw new Error("Cette ligue n'est pas au format POINTS");
  }

  if (league.lairIds.length === 0) {
    throw new Error("Cette ligue ne nécessite pas de validation de lieu");
  }

  const match = league.matches.find((item) => item.id === matchId);
  if (!match || match.matchType !== "league" || match.isKillerMatch) {
    throw new Error("Match non trouvé");
  }

  if (match.status === "CONFIRMED") {
    throw new Error("Ce match est déjà confirmé");
  }

  if (match.status !== "REPORTED") {
    throw new Error("Ce match n'est pas en attente de validation");
  }

  if (!match.lairId) {
    throw new Error("Ce match ne contient pas de lieu à valider");
  }

  if (match.lairConfirmedBy) {
    throw new Error("Ce lieu a déjà validé le résultat");
  }

  const lair = await getLairById(match.lairId);
  if (!lair || !lair.owners.includes(userId)) {
    throw new Error("Vous n'êtes pas autorisé à valider ce match pour ce lieu");
  }

  await db.collection("matches").updateOne(
    {
      matchType: "league",
      leagueId,
      _id: new ObjectId(matchId),
      status: { $ne: "CONFIRMED" },
    },
    {
      $set: {
        lairConfirmedBy: userId,
        status: "REPORTED",
        updatedAt: new Date(),
      },
    }
  );

  await tryFinalizePointsMatch(leagueId, matchId, userId);
}

function shuffleArray<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function getActiveKillerMatches(
  matches: LeagueMatch[],
  userId: string
): LeagueMatch[] {
  return matches.filter(
    (match) =>
      match.isKillerMatch &&
      match.playerIds.includes(userId) &&
      match.status !== "CONFIRMED"
  );
}

function getKillerTargetsFromMatches(
  matches: LeagueMatch[],
  userId: string
): KillerTarget[] {
  return matches
    .filter(
      (match) =>
        match.isKillerMatch && match.playerIds.includes(userId)
    )
    .map((match) => {
      const opponentId = match.playerIds.find((id) => id !== userId) || userId;
      const status = match.status || "PENDING";
      return {
        targetId: opponentId,
        gameId: match.gameId,
        lairId: match.lairId || "",
        assignedAt: match.createdAt,
        status,
        matchId: match.id,
        reportedBy: match.reportedBy,
        reportedAt: match.reportedAt,
        confirmedBy: match.confirmedBy,
        lairConfirmedBy: match.lairConfirmedBy,
        confirmedAt: match.confirmedAt,
      } as KillerTarget;
    });
}

export async function assignKillerTargets(
  leagueId: string,
  userId: string
): Promise<KillerTarget[]> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  if (league.format !== "KILLER" || !league.killerConfig) {
    throw new Error("Cette ligue n&apos;est pas au format KILLER");
  }

  const participant = await getLeagueParticipant(leagueId, userId);
  if (!participant) {
    throw new Error("Vous n&apos;êtes pas inscrit à cette ligue");
  }

  if (participant.isEliminated) {
    throw new Error("Vous avez été éliminé");
  }

  const currentTargets = getKillerTargetsFromMatches(league.matches || [], userId);
  const activeTargets = currentTargets.filter((target) => target.status !== "CONFIRMED");
  const targetLimit = Math.max(1, league.killerConfig.targets || 1);

  if (activeTargets.length >= targetLimit) {
    return currentTargets;
  }

  const user = await getUserById(userId);
  if (!user) {
    throw new Error("Utilisateur non trouvé");
  }

  const eligibleParticipants = league.participants.filter(
    (p) => p.userId !== userId && !p.isEliminated
  );
  const eligibleParticipantMap = new Map(
    eligibleParticipants.map((p) => [p.userId, p])
  );

  const activeCounts = new Map<string, number>();
  for (const participantItem of league.participants) {
    const count = getActiveKillerMatches(league.matches || [], participantItem.userId).length;
    activeCounts.set(participantItem.userId, count);
  }

  const candidateIds = eligibleParticipants
    .map((p) => p.userId)
    .filter((candidateId) =>
      !activeTargets.some((target) => target.targetId === candidateId)
    );

  const candidateUsers = await getUsersByIds(candidateIds);
  const userLairSet = new Set(
    (user.lairs || []).filter((lairId) => league.lairIds.includes(lairId))
  );
  const userGameSet = new Set(
    (user.games || []).filter((gameId) => league.gameIds.includes(gameId))
  );

  if (userLairSet.size === 0 || userGameSet.size === 0) {
    throw new Error("Votre profil ne contient pas de lieux ou jeux compatibles");
  }

  const matchesByOpponent = new Map<string, Set<string>>();
  for (const match of league.matches || []) {
    if (!match.playerIds.includes(userId)) {
      continue;
    }

    for (const opponentId of match.playerIds) {
      if (opponentId === userId) {
        continue;
      }

      const games = matchesByOpponent.get(opponentId) || new Set<string>();
      games.add(match.gameId);
      matchesByOpponent.set(opponentId, games);
    }
  }

  const activeOpponents = new Set(
    getActiveKillerMatches(league.matches || [], userId).map((match) =>
      match.playerIds.find((id) => id !== userId)
    )
  );

  const potentialTargets = candidateUsers
    .map((opponent) => {
      const opponentParticipant = eligibleParticipantMap.get(opponent.id);
      if (!opponentParticipant) {
        return null;
      }

      const opponentActiveCount = activeCounts.get(opponent.id) || 0;
      if (opponentActiveCount >= targetLimit) {
        return null;
      }

      if (activeOpponents.has(opponent.id)) {
        return null;
      }

      const commonLairs = (opponent.lairs || []).filter(
        (lairId) => userLairSet.has(lairId) && league.lairIds.includes(lairId)
      );
      const commonGames = (opponent.games || []).filter(
        (gameId) => userGameSet.has(gameId) && league.gameIds.includes(gameId)
      );
      const playedGames = matchesByOpponent.get(opponent.id) || new Set<string>();
      const availableGames = commonGames.filter(
        (gameId) => !playedGames.has(gameId)
      );

      if (commonLairs.length === 0 || availableGames.length === 0) {
        return null;
      }

      return {
        targetId: opponent.id,
        lairId: commonLairs[Math.floor(Math.random() * commonLairs.length)],
        gameId: availableGames[Math.floor(Math.random() * availableGames.length)],
      };
    })
    .filter((target): target is { targetId: string; lairId: string; gameId: string } =>
      !!target
    );

  if (potentialTargets.length === 0) {
    throw new Error(
      "Tous les matchs sont actuellement générés et vous obtiendrez vos cibles plus tard."
    );
  }

  const neededTargets = targetLimit - activeTargets.length;
  const selectedTargets = shuffleArray(potentialTargets).slice(0, neededTargets);
  const now = new Date();

  const newTargets: KillerTarget[] = [];
  for (const target of selectedTargets) {
    if (newTargets.length + activeTargets.length >= targetLimit) {
      break;
    }

    const opponentActiveCount = activeCounts.get(target.targetId) || 0;
    if (opponentActiveCount >= targetLimit) {
      continue;
    }

    if (activeOpponents.has(target.targetId)) {
      continue;
    }

    const match: Omit<LeagueTypeMatch, "id" | "createdAt"> = {
      matchType: 'league',
      leagueId,
      gameId: target.gameId,
      lairId: target.lairId,
      playedAt: now,
      playerIds: [userId, target.targetId],
      winnerIds: [],
      createdBy: userId,
      status: "PENDING",
      isKillerMatch: true,
    };

    const createdMatch = await createMatch(match);

    newTargets.push({
      targetId: target.targetId,
      gameId: target.gameId,
      lairId: target.lairId,
      assignedAt: now,
      status: "PENDING",
      matchId: createdMatch.id,
    });

    await notifyUserWithTemplate(
      userId,
      "Match de ligue assigné",
      `Un nouveau match a été assigné dans la ligue ${league.name}.`,
      "league-match-assigned",
      leagueId,
      createdMatch.id
    );

    await notifyUserWithTemplate(
      target.targetId,
      "Match de ligue assigné",
      `Un nouveau match a été assigné dans la ligue ${league.name}.`,
      "league-match-assigned",
      leagueId,
      createdMatch.id
    );

    activeCounts.set(target.targetId, opponentActiveCount + 1);
    activeOpponents.add(target.targetId);
  }

  if (newTargets.length === 0) {
    throw new Error(
      "Tous les matchs sont actuellement générés et vous obtiendrez vos cibles plus tard."
    );
  }

  const updatedTargets = [...currentTargets, ...newTargets];

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );

  return updatedTargets;
}

export async function reportKillerMatch(
  leagueId: string,
  userId: string,
  targetId: string | undefined,
  winnerId: string,
  playerScores: Record<string, number> | undefined,
  playedAt: Date,
  reporterDeckId?: string | null,
  matchId?: string
): Promise<string> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  if (league.format !== "KILLER" || !league.killerConfig) {
    throw new Error("Cette ligue n&apos;est pas au format KILLER");
  }

  if (!league.participants.some((p) => p.userId === userId)) {
    throw new Error("Vous n'êtes pas inscrit à cette ligue");
  }

  if (!matchId && !targetId) {
    throw new Error("Cible introuvable");
  }

  const matches = await getMatches({
    matchType: 'league',
    leagueId,
  });
  
  let matchDoc: LeagueMatch | undefined;
  if (matchId) {
    matchDoc = matches.find(m => m.id === matchId && m.matchType === 'league') as LeagueMatch;
  } else if (targetId) {
    matchDoc = matches.find(
      m => m.matchType === 'league' &&
      m.isKillerMatch &&
      m.status !== "CONFIRMED" &&
      m.playerIds.includes(userId) &&
      m.playerIds.includes(targetId)
    ) as LeagueMatch;
  }

  if (!matchDoc) {
    throw new Error("Cible introuvable");
  }

  if (matchDoc.status === "CONFIRMED") {
    throw new Error("Ce match est déjà finalisé");
  }

  const isPlayer = matchDoc.playerIds.includes(userId);
  let isLairOwner = false;
  let lair = null;

  if (!isPlayer && matchDoc.lairId) {
    lair = await getLairById(matchDoc.lairId);
    isLairOwner = !!lair && lair.owners.includes(userId);
  }

  if (!isPlayer && !isLairOwner) {
    throw new Error("Vous n&apos;êtes pas autorisé à modifier ce match");
  }

  const normalizedScores = playerScores
    ? matchDoc.playerIds.reduce<Record<string, number>>((acc, playerId) => {
        const rawScore = playerScores?.[playerId];
        const safeScore = Number.isFinite(rawScore)
          ? Math.max(0, Math.floor(rawScore as number))
          : 0;
        acc[playerId] = safeScore;
        return acc;
      }, {})
    : undefined;

  const computedWinnerId = normalizedScores
    ? (() => {
        const scores = Object.values(normalizedScores);
        if (scores.length === 0) return undefined;
        const maxScore = Math.max(...scores);
        const winners = matchDoc.playerIds.filter(
          (playerId) => normalizedScores[playerId] === maxScore
        );
        return winners.length === 1 ? winners[0] : undefined;
      })()
    : winnerId;

  if (!computedWinnerId) {
    throw new Error("Impossible de déterminer un vainqueur");
  }

  if (!matchDoc.playerIds.includes(computedWinnerId)) {
    throw new Error("Le gagnant doit être un joueur du match");
  }

  if (!league.gameIds.includes(matchDoc.gameId)) {
    throw new Error("Ce jeu ne fait pas partie de la ligue");
  }

  if (matchDoc.lairId && !league.lairIds.includes(matchDoc.lairId)) {
    throw new Error("Ce lieu ne fait pas partie de la ligue");
  }

  const now = new Date();

  const updatePayload: { $set: Record<string, unknown>; $unset?: Record<string, ""> } = {
    $set: {
      playedAt,
      playerScores: normalizedScores,
      winnerIds: [computedWinnerId],
      status: "REPORTED",
      reportedBy: userId,
      reportedAt: now,
    },
  };

  if (isPlayer) {
    updatePayload.$unset = {
      confirmedBy: "",
      confirmedAt: "",
    };

    if (reporterDeckId) {
      updatePayload.$set[`decks.${userId}`] = reporterDeckId;
    } else {
      updatePayload.$unset[`decks.${userId}`] = "";
    }
  }

  if (isLairOwner) {
    updatePayload.$set.lairConfirmedBy = userId;
  }

  await db.collection("matches").updateOne(
    { matchType: 'league', leagueId, _id: new ObjectId(matchDoc.id) },
    updatePayload
  );

  if (isPlayer) {
    const opponentId = matchDoc.playerIds.find((id) => id !== userId);
    if (opponentId) {
      await notifyUserWithTemplate(
        opponentId,
        "Résultat de match à confirmer",
        `Le résultat de votre match a été rapporté dans la ligue ${league.name}. Confirmez-le pour valider le match.`,
        "league-match-result-confirmation-request",
        leagueId,
        matchDoc.id
      );
    }

    const requireLair = league.killerConfig.requireLair ?? true;
    if (requireLair && matchDoc.lairId) {
      await notifyLairOwnersWithTemplate(
        matchDoc.lairId,
        "Match à confirmer",
        `Un match de ligue est en attente de confirmation pour votre lieu dans ${league.name}.`,
        "league-match-lair-confirmation-request",
        leagueId,
        matchDoc.id
      );
    }
  }

  if (isLairOwner && matchDoc.confirmedBy) {
    const updatedMatch: LeagueMatch = {
      ...matchDoc,
      playedAt,
      playerScores: normalizedScores,
      winnerIds: [computedWinnerId],
      reportedBy: userId,
      reportedAt: now,
      lairConfirmedBy: userId,
      status: "REPORTED",
    };

    await finalizeKillerMatch(
      leagueId,
      updatedMatch,
      league.killerConfig?.eliminateOnDefeat ?? false
    );
  }

  return matchDoc.id;
}

export async function updateLeagueMatchDeck(
  leagueId: string,
  matchId: string,
  actorUserId: string,
  playerId: string,
  deckId: string | null
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  const match = league.matches.find((m) => m.id === matchId);
  if (!match || match.matchType !== "league") {
    throw new Error("Match non trouvé");
  }

  if (!match.playerIds.includes(playerId)) {
    throw new Error("Le joueur ne fait pas partie de ce match");
  }

  const isManager = await isLeagueOrganizer(leagueId, actorUserId);
  if (!isManager && actorUserId !== playerId) {
    throw new Error("Vous n&apos;êtes pas autorisé à modifier ce deck");
  }

  if (!isManager && !match.playerIds.includes(actorUserId)) {
    throw new Error("Vous n&apos;êtes pas autorisé à modifier ce deck");
  }

  const updateOperation = deckId
    ? {
        $set: {
          [`decks.${playerId}`]: deckId,
          updatedAt: new Date(),
        },
      }
    : {
        $set: { updatedAt: new Date() },
        $unset: { [`decks.${playerId}`]: "" },
      };

  await db.collection("matches").updateOne(
    { matchType: 'league', leagueId, _id: new ObjectId(matchId) },
    updateOperation
  );

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: new Date() } }
  );
}

async function finalizeKillerMatch(
  leagueId: string,
  match: LeagueMatch,
  eliminateOnDefeat: boolean
): Promise<void> {
  const now = new Date();

  await db.collection("matches").updateOne(
    { matchType: 'league', leagueId, _id: new ObjectId(match.id) },
    {
      $set: {
        status: "CONFIRMED",
        confirmedAt: now,
      },
    }
  );

  if (eliminateOnDefeat) {
    const winnerId = match.winnerIds[0];
    const loserId = match.playerIds.find((id) => id !== winnerId);

    if (winnerId && loserId) {
      await db.collection(PARTICIPANTS_COLLECTION).updateOne(
        { leagueId: new ObjectId(leagueId), userId: loserId, isEliminated: { $ne: true } },
        {
          $set: {
            isEliminated: true,
            eliminatedBy: winnerId,
            eliminatedAt: now,
          },
        }
      );
    }
  }

  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    { $set: { updatedAt: now } }
  );
}

export async function confirmKillerMatch(
  leagueId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  const match = league.matches.find((m) => m.id === matchId);
  if (!match || !match.isKillerMatch) {
    throw new Error("Match non trouvé");
  }

  if (!match.playerIds.includes(userId)) {
    throw new Error("Vous ne faites pas partie de ce match");
  }

  if (match.reportedBy === userId) {
    throw new Error("Vous ne pouvez pas confirmer votre propre rapport");
  }

  if (match.confirmedBy) {
    throw new Error("Ce match a déjà été confirmé");
  }

  const requireLair = league.killerConfig?.requireLair ?? true;
  const shouldFinalize = !requireLair || !!match.lairConfirmedBy;

  const confirmedAt = shouldFinalize ? new Date() : undefined;

  await db.collection("matches").updateOne(
    { matchType: 'league', leagueId, _id: new ObjectId(matchId) },
    {
      $set: {
        confirmedBy: userId,
        status: shouldFinalize ? "CONFIRMED" : "REPORTED",
        confirmedAt,
      },
    }
  );

  const updatedMatch: LeagueMatch = {
    ...match,
    confirmedBy: userId,
    status: shouldFinalize ? "CONFIRMED" : "REPORTED",
    confirmedAt,
  };

  if (shouldFinalize) {
    await finalizeKillerMatch(
      leagueId,
      updatedMatch,
      league.killerConfig?.eliminateOnDefeat ?? false
    );
  }
}

export async function confirmKillerMatchLair(
  leagueId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  const match = league.matches.find((m) => m.id === matchId);
  if (!match || !match.isKillerMatch) {
    throw new Error("Match non trouvé");
  }

  if (!match.lairId) {
    throw new Error("Ce match n&apos;a pas de lieu associé");
  }

  const lair = await getLairById(match.lairId);
  if (!lair || !lair.owners.includes(userId)) {
    throw new Error("Vous n&apos;êtes pas autorisé à confirmer pour ce lieu");
  }

  if (match.lairConfirmedBy) {
    throw new Error("Ce match a déjà été confirmé par le lieu");
  }

  const shouldFinalize = !!match.confirmedBy;

  const confirmedAt = shouldFinalize ? new Date() : undefined;

  await db.collection("matches").updateOne(
    { matchType: 'league', leagueId, _id: new ObjectId(matchId) },
    {
      $set: {
        lairConfirmedBy: userId,
        status: shouldFinalize ? "CONFIRMED" : "REPORTED",
        confirmedAt,
      },
    }
  );

  const updatedMatch: LeagueMatch = {
    ...match,
    lairConfirmedBy: userId,
    status: shouldFinalize ? "CONFIRMED" : "REPORTED",
    confirmedAt,
  };

  if (shouldFinalize) {
    await finalizeKillerMatch(
      leagueId,
      updatedMatch,
      league.killerConfig?.eliminateOnDefeat ?? false
    );
  }
}

export async function confirmLeagueMatch(
  leagueId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  const match = league.matches.find((item) => item.id === matchId);
  if (!match || match.matchType !== "league") {
    throw new Error("Match non trouvé");
  }

  if (match.isKillerMatch || league.format === "KILLER") {
    await confirmKillerMatch(leagueId, matchId, userId);
    return;
  }

  await confirmPointsLeagueMatch(leagueId, matchId, userId);
}

export async function confirmLeagueMatchLair(
  leagueId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new Error("Ligue non trouvée");
  }

  const match = league.matches.find((item) => item.id === matchId);
  if (!match || match.matchType !== "league") {
    throw new Error("Match non trouvé");
  }

  if (match.isKillerMatch || league.format === "KILLER") {
    await confirmKillerMatchLair(leagueId, matchId, userId);
    return;
  }

  await confirmPointsLeagueMatchLair(leagueId, matchId, userId);
}
