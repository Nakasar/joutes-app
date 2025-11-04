import { getDb } from "@/lib/mongodb";
import { GameMatch, GameMatchPlayer } from "@/lib/types/GameMatch";
import { ObjectId, WithId, Document } from "mongodb";

const COLLECTION_NAME = "gameMatches";

// Type pour une partie dans MongoDB (avec _id)
export type GameMatchDocument = {
  _id: ObjectId;
  gameId: string;
  playedAt: Date;
  lairId?: string;
  playerIds: string[]; // Stocke uniquement les IDs des joueurs
  createdBy: string;
  createdAt: Date;
};

// Convertir un document MongoDB enrichi (avec aggregate) en GameMatch
function toGameMatch(doc: WithId<Document>): GameMatch {
  return {
    id: doc._id.toString(),
    gameId: doc.gameId,
    playedAt: doc.playedAt,
    lairId: doc.lairId,
    playerIds: doc.playerIds || [],
    players: doc.players || [], // Rempli par aggregate
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

// Convertir un GameMatch en document MongoDB (sans id)
function toDocument(gameMatch: Omit<GameMatch, "id" | "createdAt" | "players">): Omit<GameMatchDocument, "_id" | "createdAt"> {
  return {
    gameId: gameMatch.gameId,
    playedAt: gameMatch.playedAt,
    lairId: gameMatch.lairId,
    playerIds: gameMatch.playerIds,
    createdBy: gameMatch.createdBy,
  };
}

export async function createGameMatch(gameMatch: Omit<GameMatch, "id" | "createdAt" | "players">): Promise<GameMatch> {
  const db = await getDb();
  const doc = {
    ...toDocument(gameMatch),
    createdAt: new Date(),
  };
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  // Récupérer la partie créée avec les détails des joueurs
  const createdMatch = await getGameMatchById(result.insertedId.toString());
  
  if (!createdMatch) {
    throw new Error("Erreur lors de la récupération de la partie créée");
  }
  
  return createdMatch;
}

export async function getGameMatchById(id: string): Promise<GameMatch | null> {
  const db = await getDb();
  
  const matches = await db.collection<GameMatchDocument>(COLLECTION_NAME).aggregate([
    { $match: { _id: new ObjectId(id) } },
    {
      $lookup: {
        from: "users",
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
  
  return matches.length > 0 ? toGameMatch(matches[0] as WithId<Document>) : null;
}

export interface GetGameMatchesFilters {
  userId?: string;
  gameId?: string;
  lairId?: string;
  playerUserIds?: string[];
}

export async function getGameMatches(filters: GetGameMatchesFilters = {}): Promise<GameMatch[]> {
  const db = await getDb();
  const matchQuery: {
    playerIds?: string | { $in: string[] };
    gameId?: string;
    lairId?: string;
  } = {};
  
  // Filtrer par joueur participant
  if (filters.userId) {
    matchQuery.playerIds = filters.userId;
  }
  
  // Filtrer par jeu
  if (filters.gameId) {
    matchQuery.gameId = filters.gameId;
  }
  
  // Filtrer par lair
  if (filters.lairId) {
    matchQuery.lairId = filters.lairId;
  }
  
  // Filtrer par liste de joueurs (toutes les parties contenant au moins l'un de ces joueurs)
  if (filters.playerUserIds && filters.playerUserIds.length > 0) {
    matchQuery.playerIds = { $in: filters.playerUserIds };
  }
  
  const matches = await db
    .collection<GameMatchDocument>(COLLECTION_NAME)
    .aggregate([
      { $match: matchQuery },
      { $sort: { playedAt: -1 } }, // Trier par date de partie décroissante
      {
        $lookup: {
          from: "users",
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
    ])
    .toArray();
  
  return matches.map(m => toGameMatch(m as WithId<Document>));
}

export async function getGameMatchesByUser(userId: string): Promise<GameMatch[]> {
  const db = await getDb();
  
  // Récupérer les parties où l'utilisateur est joueur OU créateur
  const matches = await db
    .collection<GameMatchDocument>(COLLECTION_NAME)
    .aggregate([
      {
        $match: {
          $or: [
            { playerIds: userId },
            { createdBy: userId }
          ]
        }
      },
      { $sort: { playedAt: -1 } },
      {
        $lookup: {
          from: "users",
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
    ])
    .toArray();
  
  return matches.map(m => toGameMatch(m as WithId<Document>));
}

export async function updateGameMatch(id: string, gameMatch: Partial<Omit<GameMatch, "id" | "createdAt" | "createdBy" | "players">>): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<GameMatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(id) },
    { $set: gameMatch }
  );
  
  return result.modifiedCount > 0;
}

export async function deleteGameMatch(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<GameMatchDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function removePlayerFromGameMatch(matchId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<GameMatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(matchId) },
    { $pull: { playerIds: userId } }
  );
  
  return result.modifiedCount > 0;
}

export async function addPlayerToGameMatch(
  matchId: string,
  userId: string
): Promise<boolean> {
  const db = await getDb();
  
  // Vérifier que le joueur n'est pas déjà dans la partie
  const match = await db.collection<GameMatchDocument>(COLLECTION_NAME).findOne({
    _id: new ObjectId(matchId),
    playerIds: userId,
  });
  
  if (match) {
    // Le joueur est déjà dans la partie
    return false;
  }
  
  // Ajouter le joueur
  const result = await db.collection<GameMatchDocument>(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(matchId) },
    { $push: { playerIds: userId } }
  );
  
  return result.modifiedCount > 0;
}
