import db from "@/lib/mongodb";
import {
  League,
  CreateLeagueInput,
  UpdateLeagueInput,
  SearchLeaguesOptions,
  PaginatedLeaguesResult,
  LeagueParticipant,
  LeagueMatch,
  CreateLeagueMatchInput,
  MatchFeatAward,
  PointHistoryEntry,
} from "@/lib/types/League";
import {ObjectId, WithId, Document, Filter} from "mongodb";
import {nanoid} from "nanoid";
import {User} from "@/lib/types/User";

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

// Convertir un document MongoDB en League
async function toLeague(doc: WithId<Document>, includeParticipants: boolean = true): Promise<League> {
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
        targets: p.targets,
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
    targetsConfig: doc.targetsConfig,
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
    matches: (doc.matches || []).map((m: LeagueMatch) => ({
      ...m,
      playedAt: new Date(m.playedAt),
      createdAt: new Date(m.createdAt),
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
    targetsConfig: league.targetsConfig,
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

    return doc ? toLeague(doc) : null;
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
  return doc ? toLeague(doc) : null;
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

  return result ? toLeague(result) : null;
}

// Supprimer une ligue
export async function deleteLeague(id: string): Promise<boolean> {
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
    targets: participantDoc.targets,
  };
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

// Obtenir le classement d'une ligue
export async function getLeagueRanking(
  leagueId: string
): Promise<(LeagueParticipant & {
  rank: number;
  user?: { id: string; discriminator?: string; displayName?: string; avatar?: string; username: string }
})[]> {
  const league = await getLeagueById(leagueId);
  if (!league) return [];

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
  const allWinnersArePlayers = matchInput.winnerIds.every((winnerId) =>
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
      const isWinner = matchInput.winnerIds.includes(playerId);
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
  const newMatch: LeagueMatch = {
    id: matchId,
    gameId: matchInput.gameId,
    playedAt: matchInput.playedAt,
    playerIds: matchInput.playerIds,
    winnerIds: matchInput.winnerIds,
    featAwards: processedFeatAwards.length > 0 ? processedFeatAwards : undefined,
    createdBy,
    createdAt: new Date(),
    notes: matchInput.notes,
  };

  // Ajouter le match à la ligue
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    {
      $push: { matches: newMatch as unknown as Document },
      $set: { updatedAt: new Date() },
    } as Document
  );

  return getLeagueById(leagueId);
}

// Récupérer les matchs d'une ligue
export async function getLeagueMatches(leagueId: string): Promise<LeagueMatch[]> {
  const league = await getLeagueById(leagueId);
  if (!league) return [];

  return league.matches || [];
}

// Supprimer un match d'une ligue (annule aussi les points attribués)
export async function deleteLeagueMatch(
  leagueId: string,
  matchId: string
): Promise<League | null> {
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  const match = league.matches?.find((m) => m.id === matchId);
  if (!match) return null;

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

  // Supprimer le match
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(leagueId) },
    {
      $pull: { matches: { id: matchId } },
      $set: { updatedAt: new Date() },
    } as Document
  );

  return getLeagueById(leagueId);
}
