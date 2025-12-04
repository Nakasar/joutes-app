import db from "@/lib/mongodb";
import {
  League,
  CreateLeagueInput,
  UpdateLeagueInput,
  SearchLeaguesOptions,
  PaginatedLeaguesResult,
  LeagueParticipant,
} from "@/lib/types/League";
import { ObjectId, WithId, Document, Filter } from "mongodb";
import { nanoid } from "nanoid";

const COLLECTION_NAME = "leagues";

// Type pour une ligue dans MongoDB (avec _id)
export type LeagueDocument = Omit<League, "id"> & { _id: ObjectId };

// Convertir un document MongoDB en League
function toLeague(doc: WithId<Document>): League {
  return {
    id: doc._id.toString(),
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
    organizerIds: doc.organizerIds || [],
    participants: (doc.participants || []).map((p: LeagueParticipant) => ({
      ...p,
      joinedAt: new Date(p.joinedAt),
      eliminatedAt: p.eliminatedAt ? new Date(p.eliminatedAt) : undefined,
      pointsHistory: (p.pointsHistory || []).map((h) => ({
        ...h,
        date: new Date(h.date),
      })),
      feats: (p.feats || []).map((f) => ({
        ...f,
        earnedAt: new Date(f.earnedAt),
      })),
    })),
    maxParticipants: doc.maxParticipants,
    minParticipants: doc.minParticipants,
    isPublic: doc.isPublic,
    invitationCode: doc.invitationCode,
    gameIds: doc.gameIds || [],
    lairIds: doc.lairIds || [],
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
  };
}

// Convertir une League en document MongoDB (sans id)
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
    participants: league.participants || [],
    maxParticipants: league.maxParticipants,
    minParticipants: league.minParticipants,
    isPublic: league.isPublic,
    invitationCode: league.invitationCode,
    gameIds: league.gameIds,
    lairIds: league.lairIds,
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
    invitationCode: doc.invitationCode,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Récupérer une ligue par son ID
export async function getLeagueById(id: string): Promise<League | null> {
  try {
    const doc = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
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
    .findOne({ invitationCode: code });
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
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
}

// Supprimer une ligue
export async function deleteLeague(id: string): Promise<boolean> {
  const result = await db
    .collection(COLLECTION_NAME)
    .deleteOne({ _id: new ObjectId(id) });
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
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Filtrer par statut
  if (status) {
    if (Array.isArray(status)) {
      filter.status = { $in: status };
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
    filter.gameIds = { $in: gameIds };
  }

  // Filtrer par créateur
  if (creatorId) {
    filter.creatorId = creatorId;
  }

  // Filtrer par participant
  if (participantId) {
    filter["participants.userId"] = participantId;
  }

  const skip = (page - 1) * limit;

  const [leagues, total] = await Promise.all([
    db
      .collection(COLLECTION_NAME)
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION_NAME).countDocuments(filter),
  ]);

  return {
    leagues: leagues.map(toLeague),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
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
  if (league.participants.some((p) => p.userId === userId)) {
    return league;
  }

  // Vérifier le nombre maximum de participants
  if (
    league.maxParticipants &&
    league.participants.length >= league.maxParticipants
  ) {
    throw new Error("La ligue a atteint le nombre maximum de participants");
  }

  const newParticipant: LeagueParticipant = {
    userId,
    points: 0,
    pointsHistory: [],
    feats: [],
    joinedAt: new Date(),
  };

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(leagueId) },
    {
      $push: { participants: newParticipant as unknown as Document },
      $set: { updatedAt: new Date() },
    } as Document,
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
}

// Retirer un participant d'une ligue
export async function removeParticipant(
  leagueId: string,
  userId: string
): Promise<League | null> {
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(leagueId) },
    {
      $pull: { participants: { userId } },
      $set: { updatedAt: new Date() },
    } as Document,
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
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
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  const participantIndex = league.participants.findIndex(
    (p) => p.userId === userId
  );
  if (participantIndex === -1) return null;

  const historyEntry = {
    date: new Date(),
    points,
    reason,
    eventId,
    featId,
  };

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(leagueId), "participants.userId": userId },
    {
      $inc: { [`participants.${participantIndex}.points`]: points },
      $push: { [`participants.${participantIndex}.pointsHistory`]: historyEntry },
      $set: { updatedAt: new Date() },
    } as Document,
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
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

  const participantIndex = league.participants.findIndex(
    (p) => p.userId === userId
  );
  if (participantIndex === -1) return null;

  // Vérifier si le haut fait existe dans la configuration
  const feat = league.pointsConfig?.pointsRules.feats.find(
    (f) => f.id === featId
  );
  if (!feat) return null;

  // Vérifier les limites du haut fait
  const participant = league.participants[participantIndex];
  const featCount = participant.feats.filter((f) => f.featId === featId).length;

  if (feat.maxPerLeague && featCount >= feat.maxPerLeague) {
    throw new Error("Limite de ce haut fait atteinte pour la ligue");
  }

  const participantFeat = {
    featId,
    earnedAt: new Date(),
    eventId,
  };

  // Ajouter le haut fait et les points associés
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(leagueId), "participants.userId": userId },
    {
      $inc: { [`participants.${participantIndex}.points`]: feat.points },
      $push: {
        [`participants.${participantIndex}.feats`]: participantFeat,
        [`participants.${participantIndex}.pointsHistory`]: {
          date: new Date(),
          points: feat.points,
          reason: `Haut fait: ${feat.title}`,
          eventId,
          featId,
        },
      },
      $set: { updatedAt: new Date() },
    } as Document,
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
}

// Obtenir le classement d'une ligue
export async function getLeagueRanking(
  leagueId: string
): Promise<(LeagueParticipant & { rank: number })[]> {
  const league = await getLeagueById(leagueId);
  if (!league) return [];

  // Trier par points décroissants
  const sortedParticipants = [...league.participants]
    .filter((p) => !p.isEliminated)
    .sort((a, b) => b.points - a.points);

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
  const { page = 1, limit = 10 } = options;

  const filter: Filter<Document> = {
    $or: [
      { creatorId: userId },
      { organizerIds: userId },
      { "participants.userId": userId },
    ],
  };

  const skip = (page - 1) * limit;

  const [leagues, total] = await Promise.all([
    db
      .collection(COLLECTION_NAME)
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION_NAME).countDocuments(filter),
  ]);

  return {
    leagues: leagues.map(toLeague),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
