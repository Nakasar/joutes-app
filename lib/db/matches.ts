import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import {
  Match,
  GameTypeMatch,
  LeagueTypeMatch,
  EventTypeMatch,
  GameMatchPlayer,
  GameMatchRating,
  GameMatchMVPVote,
  MatchFeatAward,
  isGameMatch,
  isLeagueMatch,
  isEventMatch,
} from "@/lib/types/Match";

const COLLECTION_NAME = "matches";

// Type pour un match dans MongoDB (avec _id)
export type MatchDocument = {
  _id: ObjectId;
  matchType: 'game' | 'league' | 'event';
  playedAt: Date;
  lairId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  reportedBy?: string;
  reportedAt?: Date;
  confirmedBy?: string;
  confirmedAt?: Date;
  winnerIds?: string[];
  
  // Game match fields
  gameId?: string;
  playerIds?: string[];
  ratings?: GameMatchRating[];
  mvpVotes?: GameMatchMVPVote[];
  
  // League match fields
  leagueId?: string;
  playerScores?: Record<string, number>;
  featAwards?: MatchFeatAward[];
  notes?: string;
  status?: "PENDING" | "REPORTED" | "CONFIRMED" | 'pending' | 'in-progress' | 'completed' | 'disputed';
  lairConfirmedBy?: string;
  targetId?: string;
  isKillerMatch?: boolean;
  lairName?: string;
  
  // Event match fields
  eventId?: string;
  phaseId?: string;
  player1Id?: string;
  player2Id?: string | null;
  player1Name?: string;
  player2Name?: string;
  player1Score?: number;
  player2Score?: number;
  winnerId?: string | null;
  round?: number;
  bracketPosition?: string;
};

// Convertir un document MongoDB enrichi en Match typé
function toMatch(doc: WithId<Document>): Match {
  const base = {
    id: doc._id.toString(),
    matchType: doc.matchType,
    playedAt: doc.playedAt,
    lairId: doc.lairId,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    reportedBy: doc.reportedBy,
    reportedAt: doc.reportedAt,
    confirmedBy: doc.confirmedBy,
    confirmedAt: doc.confirmedAt,
  };

  if (doc.matchType === 'game') {
    return {
      ...base,
      matchType: 'game',
      gameId: doc.gameId,
      playerIds: doc.playerIds || [],
      players: doc.players || [],
      ratings: doc.ratings || [],
      mvpVotes: doc.mvpVotes || [],
      winnerIds: doc.winnerIds || [],
    } as GameTypeMatch;
  } else if (doc.matchType === 'league') {
    return {
      ...base,
      matchType: 'league',
      leagueId: doc.leagueId!,
      gameId: doc.gameId!,
      playerIds: doc.playerIds || [],
      playerScores: doc.playerScores,
      winnerIds: doc.winnerIds || [],
      featAwards: doc.featAwards,
      notes: doc.notes,
      status: doc.status,
      lairConfirmedBy: doc.lairConfirmedBy,
      targetId: doc.targetId,
      isKillerMatch: doc.isKillerMatch,
      lairName: doc.lairName,
    } as LeagueTypeMatch;
  } else if (doc.matchType === 'event') {
    return {
      ...base,
      matchType: 'event',
      eventId: doc.eventId!,
      phaseId: doc.phaseId!,
      player1Id: doc.player1Id!,
      player2Id: doc.player2Id,
      player1Name: doc.player1Name,
      player2Name: doc.player2Name,
      player1Score: doc.player1Score || 0,
      player2Score: doc.player2Score || 0,
      winnerId: doc.winnerId,
      round: doc.round,
      bracketPosition: doc.bracketPosition,
      status: doc.status || 'pending',
    } as EventTypeMatch;
  } else {
    throw new Error("Type de match inconnu");
  }
}

// Convertir un Match en document MongoDB (sans id)
function toDocument(match: Omit<Match, "id" | "createdAt">): Omit<MatchDocument, "_id" | "createdAt"> {
  const base = {
    matchType: match.matchType,
    playedAt: match.playedAt,
    lairId: match.lairId,
    createdBy: match.createdBy,
    updatedAt: match.updatedAt,
    reportedBy: match.reportedBy,
    reportedAt: match.reportedAt,
    confirmedBy: match.confirmedBy,
    confirmedAt: match.confirmedAt,
  };

  if (isGameMatch(match)) {
    return {
      ...base,
      gameId: match.gameId,
      playerIds: match.playerIds,
      ratings: match.ratings,
      mvpVotes: match.mvpVotes,
      winnerIds: match.winnerIds,
    };
  } else if (isLeagueMatch(match)) {
    return {
      ...base,
      leagueId: match.leagueId,
      gameId: match.gameId,
      playerIds: match.playerIds,
      playerScores: match.playerScores,
      winnerIds: match.winnerIds,
      featAwards: match.featAwards,
      notes: match.notes,
      status: match.status,
      lairConfirmedBy: match.lairConfirmedBy,
      targetId: match.targetId,
      isKillerMatch: match.isKillerMatch,
      lairName: match.lairName,
    };
  } else if (isEventMatch(match)) {
    return {
      ...base,
      eventId: match.eventId,
      phaseId: match.phaseId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      player1Name: match.player1Name,
      player2Name: match.player2Name,
      player1Score: match.player1Score,
      player2Score: match.player2Score,
      winnerId: match.winnerId,
      round: match.round,
      bracketPosition: match.bracketPosition,
      status: match.status,
    };
  } else {
    throw new Error("Type de match inconnu");
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function createMatch(match: Omit<Match, "id" | "createdAt">): Promise<Match> {
  const doc = {
    ...toDocument(match),
    createdAt: new Date(),
  };
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  // Récupérer le match créé avec les détails des joueurs si c'est un game match
  const createdMatch = await getMatchById(result.insertedId.toString());
  
  if (!createdMatch) {
    throw new Error("Erreur lors de la récupération du match créé");
  }
  
  return createdMatch;
}

// ============================================================================
// READ
// ============================================================================

export async function getMatchById(id: string): Promise<Match | null> {
  const doc = await db.collection<MatchDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  
  if (!doc) {
    return null;
  }

  // Si c'est un game match, enrichir avec les détails des joueurs
  if (doc.matchType === 'game' && doc.playerIds && doc.playerIds.length > 0) {
    const matches = await db.collection<MatchDocument>(COLLECTION_NAME).aggregate([
      { $match: { _id: new ObjectId(id) } },
      {
        $lookup: {
          from: "user",
          let: { playerIds: { $map: { input: "$playerIds", as: "pid", in: { $toObjectId: "$$pid" } } } },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$playerIds"] } } },
            {
              $project: {
                _id: 1,
                username: 1,
                displayName: 1,
                discriminator: 1,
              }
            }
          ],
          as: "playerDetails"
        }
      },
      {
        $addFields: {
          players: {
            $map: {
              input: "$playerDetails",
              as: "player",
              in: {
                userId: { $toString: "$$player._id" },
                username: {
                  $cond: {
                    if: { $and: ["$$player.displayName", "$$player.discriminator"] },
                    then: { $concat: ["$$player.displayName", "#", "$$player.discriminator"] },
                    else: "$$player.username"
                  }
                },
                displayName: "$$player.displayName",
                discriminator: "$$player.discriminator",
              }
            }
          }
        }
      },
      { $project: { playerDetails: 0 } }
    ]).toArray();
    
    return matches.length > 0 ? toMatch(matches[0] as WithId<Document>) : null;
  }
  
  return toMatch(doc as WithId<Document>);
}

export interface GetMatchesFilters {
  matchType?: 'game' | 'league' | 'event';
  userId?: string;
  gameId?: string;
  lairId?: string;
  leagueId?: string;
  eventId?: string;
  phaseId?: string;
  playerUserIds?: string[];
}

export async function getMatches(filters: GetMatchesFilters = {}): Promise<Match[]> {
  const matchQuery: Record<string, unknown> = {};
  
  // Filtrer par type de match
  if (filters.matchType) {
    matchQuery.matchType = filters.matchType;
  }
  
  // Filtrer par joueur participant (pour game et league matches)
  if (filters.userId) {
    matchQuery.$or = [
      { playerIds: filters.userId },
      { player1Id: filters.userId },
      { player2Id: filters.userId },
      { createdBy: filters.userId },
    ];
  }
  
  // Filtrer par jeu
  if (filters.gameId) {
    matchQuery.gameId = filters.gameId;
  }
  
  // Filtrer par lair
  if (filters.lairId) {
    matchQuery.lairId = filters.lairId;
  }
  
  // Filtrer par ligue
  if (filters.leagueId) {
    matchQuery.leagueId = filters.leagueId;
  }
  
  // Filtrer par événement
  if (filters.eventId) {
    matchQuery.eventId = filters.eventId;
  }
  
  // Filtrer par phase
  if (filters.phaseId) {
    matchQuery.phaseId = filters.phaseId;
  }
  
  // Filtrer par liste de joueurs
  if (filters.playerUserIds && filters.playerUserIds.length > 0) {
    matchQuery.$or = [
      { playerIds: { $in: filters.playerUserIds } },
      { player1Id: { $in: filters.playerUserIds } },
      { player2Id: { $in: filters.playerUserIds } },
    ];
  }
  
  const matches = await db
    .collection<MatchDocument>(COLLECTION_NAME)
    .aggregate([
      { $match: matchQuery },
      { $sort: { playedAt: -1 } },
      {
        $lookup: {
          from: "user",
          let: { 
            playerIds: { 
              $cond: {
                if: { $isArray: "$playerIds" },
                then: { $map: { input: "$playerIds", as: "pid", in: { $toObjectId: "$$pid" } } },
                else: []
              }
            }
          },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$playerIds"] } } },
            {
              $project: {
                _id: 1,
                username: 1,
                displayName: 1,
                discriminator: 1,
              }
            }
          ],
          as: "playerDetails"
        }
      },
      {
        $addFields: {
          players: {
            $cond: {
              if: { $eq: ["$matchType", "game"] },
              then: {
                $map: {
                  input: "$playerDetails",
                  as: "player",
                  in: {
                    userId: { $toString: "$$player._id" },
                    username: {
                      $cond: {
                        if: { $and: ["$$player.displayName", "$$player.discriminator"] },
                        then: { $concat: ["$$player.displayName", "#", "$$player.discriminator"] },
                        else: "$$player.username"
                      }
                    },
                    displayName: "$$player.displayName",
                    discriminator: "$$player.discriminator",
                  }
                }
              },
              else: []
            }
          }
        }
      },
      { $project: { playerDetails: 0 } }
    ])
    .toArray();
  
  return matches.map(m => toMatch(m as WithId<Document>));
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateMatch(id: string, match: Partial<Omit<Match, "id" | "createdAt" | "createdBy">>): Promise<boolean> {
  const updateData: Record<string, unknown> = {
    ...match,
    updatedAt: new Date(),
  };
  
  const result = await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );
  
  return result.modifiedCount > 0;
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteMatch(id: string): Promise<boolean> {
  const result = await db.collection<MatchDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

// ============================================================================
// GAME MATCH SPECIFIC OPERATIONS
// ============================================================================

export async function removePlayerFromMatch(matchId: string, userId: string): Promise<boolean> {
  const result = await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(matchId), matchType: 'game' },
    { $pull: { playerIds: userId } }
  );
  
  return result.modifiedCount > 0;
}

export async function addPlayerToMatch(matchId: string, userId: string): Promise<boolean> {
  // Vérifier que le joueur n'est pas déjà dans le match
  const match = await db.collection<MatchDocument>(COLLECTION_NAME).findOne({
    _id: new ObjectId(matchId),
    matchType: 'game',
    playerIds: userId,
  });
  
  if (match) {
    return false;
  }
  
  const result = await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(matchId), matchType: 'game' },
    { $push: { playerIds: userId } }
  );
  
  return result.modifiedCount > 0;
}

export async function rateMatch(
  matchId: string,
  userId: string,
  rating: 1 | 2 | 3 | 4 | 5
): Promise<boolean> {
  const match = await db.collection<MatchDocument>(COLLECTION_NAME).findOne({
    _id: new ObjectId(matchId),
    matchType: 'game',
  }, { projection: { ratings: 1 } });
  
  if (!match) {
    return false;
  }

  if (match.ratings?.some(r => r.userId === userId)) {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $pull: { ratings: { userId } } }
    );
  }
  
  if (match.ratings) {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $push: { ratings: { userId, rating } } }
    );
  } else {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $set: { ratings: [{ userId, rating }] } }
    );
  }
  
  return true;
}

export async function voteMVP(
  matchId: string,
  voterId: string,
  votedForId: string
): Promise<boolean> {
  const existingVote = await db.collection<MatchDocument>(COLLECTION_NAME).findOne({
    _id: new ObjectId(matchId),
    matchType: 'game',
    mvpVotes: { $elemMatch: { voterId } },
  });
  
  if (existingVote && existingVote.mvpVotes) {
    const alreadyVotedForSamePlayer = existingVote.mvpVotes.some(v => v.voterId === voterId && v.votedForId === votedForId);
    
    if (alreadyVotedForSamePlayer) {
      return true;
    }

    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $pull: { mvpVotes: { voterId } } }
    );
  }
  
  const matchVotes = await db.collection<MatchDocument>(COLLECTION_NAME).findOne({
    _id: new ObjectId(matchId),
    matchType: 'game',
  }, { projection: { mvpVotes: 1 } });
  
  if (matchVotes?.mvpVotes) {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $push: { mvpVotes: { voterId, votedForId } } },
    );
  } else {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $set: { mvpVotes: [{ voterId, votedForId }] } },
    );
  }

  return true;
}

export async function toggleWinner(
  matchId: string,
  userId: string
): Promise<boolean> {
  const match = await db.collection<MatchDocument>(COLLECTION_NAME).findOne({
    _id: new ObjectId(matchId),
    matchType: 'game',
  }, { projection: { winnerIds: 1 } });
  
  if (match?.winnerIds?.includes(userId)) {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $pull: { winnerIds: userId } }
    );
  } else if (match?.winnerIds) {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $push: { winnerIds: userId } }
    );
  } else {
    await db.collection<MatchDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(matchId), matchType: 'game' },
      { $set: { winnerIds: [userId] } }
    );
  }
  
  return true;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export async function deleteMatchesByEventId(eventId: string): Promise<number> {
  const result = await db.collection<MatchDocument>(COLLECTION_NAME).deleteMany({ 
    matchType: 'event',
    eventId 
  });
  return result.deletedCount;
}

export async function deleteMatchesByLeagueId(leagueId: string): Promise<number> {
  const result = await db.collection<MatchDocument>(COLLECTION_NAME).deleteMany({ 
    matchType: 'league',
    leagueId 
  });
  return result.deletedCount;
}
