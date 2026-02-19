import { GameMatch } from "@/lib/types/GameMatch";
import { GameTypeMatch } from "@/lib/types/Match";
import {
  createMatch,
  getMatchById,
  getMatches,
  updateMatch,
  deleteMatch,
  addPlayerToMatch as addPlayerToMatchUnified,
  removePlayerFromMatch as removePlayerFromMatchUnified,
  rateMatch,
  voteMVP,
  toggleWinner,
} from "@/lib/db/matches";

// Adapters pour maintenir la rétrocompatibilité avec l'API existante
function toGameMatch(match: GameTypeMatch): GameMatch {
  return {
    ...match,
    players: match.players || [],
  };
}

export interface GetGameMatchesFilters {
  userId?: string;
  gameId?: string;
  lairId?: string;
  playerUserIds?: string[];
}

export async function createGameMatch(gameMatch: Omit<GameMatch, "id" | "createdAt" | "players">): Promise<GameMatch> {
  const match = await createMatch({
    ...gameMatch,
    matchType: 'game',
  });
  
  return toGameMatch(match as GameTypeMatch);
}

export async function getGameMatchById(id: string): Promise<GameMatch | null> {
  const match = await getMatchById(id);
  
  if (!match || match.matchType !== 'game') {
    return null;
  }
  
  return toGameMatch(match as GameTypeMatch);
}

export async function getGameMatches(filters: GetGameMatchesFilters = {}): Promise<GameMatch[]> {
  const matches = await getMatches({
    matchType: 'game',
    userId: filters.userId,
    gameId: filters.gameId,
    lairId: filters.lairId,
    playerUserIds: filters.playerUserIds,
  });
  
  return matches.filter(m => m.matchType === 'game').map(m => toGameMatch(m as GameTypeMatch));
}

export async function getGameMatchesByUser(userId: string): Promise<GameMatch[]> {
  const matches = await getMatches({
    matchType: 'game',
    userId,
  });
  
  return matches.filter(m => m.matchType === 'game').map(m => toGameMatch(m as GameTypeMatch));
}

export async function updateGameMatch(id: string, gameMatch: Partial<Omit<GameMatch, "id" | "createdAt" | "createdBy" | "players">>): Promise<boolean> {
  return updateMatch(id, gameMatch);
}

export async function deleteGameMatch(id: string): Promise<boolean> {
  return deleteMatch(id);
}

export async function removePlayerFromGameMatch(matchId: string, userId: string): Promise<boolean> {
  return removePlayerFromMatchUnified(matchId, userId);
}

export async function addPlayerToGameMatch(
  matchId: string,
  userId: string
): Promise<boolean> {
  return addPlayerToMatchUnified(matchId, userId);
}

export async function rateGameMatch(
  matchId: string,
  userId: string,
  rating: 1 | 2 | 3 | 4 | 5
): Promise<boolean> {
  return rateMatch(matchId, userId, rating);
}

export async function voteGameMatchMVP(
  matchId: string,
  voterId: string,
  votedForId: string
): Promise<boolean> {
  return voteMVP(matchId, voterId, votedForId);
}

export async function toggleGameMatchWinner(
  matchId: string,
  userId: string
): Promise<boolean> {
  return toggleWinner(matchId, userId);
}
