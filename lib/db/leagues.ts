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
    matches: (doc.matches || []).map((m: LeagueMatch) => ({
      ...m,
      playedAt: new Date(m.playedAt),
      createdAt: new Date(m.createdAt),
    })),
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
    const { pointsRules } = league.pointsConfig;
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
      const participantIndex = league.participants.findIndex(
        (p) => p.userId === update.userId
      );
      if (participantIndex === -1) continue;

      const historyEntry = {
        date: matchDate,
        points: update.points,
        reason: update.reason,
        matchId,
      };

      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(leagueId) },
        {
          $inc: { [`participants.${participantIndex}.points`]: update.points },
          $push: {
            [`participants.${participantIndex}.pointsHistory`]: historyEntry,
          },
        } as Document
      );
    }

    // Attribuer les hauts faits du match
    if (matchInput.featAwards && matchInput.featAwards.length > 0) {
      for (const featAward of matchInput.featAwards) {
        const participantIndex = league.participants.findIndex(
          (p) => p.userId === featAward.playerId
        );
        if (participantIndex === -1) {
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

        const participant = league.participants[participantIndex];
        
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

          const participantFeat = {
            featId: featAward.featId,
            earnedAt: matchDate,
            matchId,
          };

          const featHistoryEntry = {
            date: matchDate,
            points: feat.points,
            reason: `Haut fait: ${feat.title}`,
            featId: featAward.featId,
            matchId,
          };

          await db.collection(COLLECTION_NAME).updateOne(
            { _id: new ObjectId(leagueId) },
            {
              $inc: { [`participants.${participantIndex}.points`]: feat.points },
              $push: {
                [`participants.${participantIndex}.feats`]: participantFeat,
                [`participants.${participantIndex}.pointsHistory`]: featHistoryEntry,
              },
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
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(leagueId) },
    {
      $push: { matches: newMatch as unknown as Document },
      $set: { updatedAt: new Date() },
    } as Document,
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
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
      const participantIndex = league.participants.findIndex(
        (p) => p.userId === playerId
      );
      if (participantIndex === -1) continue;

      const participant = league.participants[participantIndex];
      
      // Calculer les points à retirer (depuis l'historique)
      const matchHistoryEntries = participant.pointsHistory.filter(
        (h) => h.matchId === matchId
      );
      const pointsToRemove = matchHistoryEntries.reduce(
        (sum, entry) => sum + entry.points,
        0
      );

      // Retirer les points et l'historique
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(leagueId) },
        {
          $inc: { [`participants.${participantIndex}.points`]: -pointsToRemove },
          $pull: {
            [`participants.${participantIndex}.pointsHistory`]: { matchId },
            [`participants.${participantIndex}.feats`]: { matchId },
          },
        } as Document
      );
    }
  }

  // Supprimer le match
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(leagueId) },
    {
      $pull: { matches: { id: matchId } },
      $set: { updatedAt: new Date() },
    } as Document,
    { returnDocument: "after" }
  );

  return result ? toLeague(result) : null;
}
