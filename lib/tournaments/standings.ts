import {
  DEFAULT_FIXED_SCORING,
  DEFAULT_RANK_OFFSETS,
  type TournamentFixedScoring,
  type TournamentMatch,
  type TournamentPhase,
  type TournamentScoringMethod,
} from "@/lib/types/Tournament";
import type { PlayerStanding } from "@/lib/utils/pairing";
import {
  type GameTournamentPreset,
  type TiebreakerKey,
  byeStats,
  presetStatKeys,
  presetTiebreakers,
} from "@/lib/tournaments/game-presets";

/**
 * Calcul du classement d'un tournoi.
 *
 * Module pur, sans accès à la base : c'est la règle du jeu, pas de la
 * persistance. Le séparer de lib/db/tournaments.ts le rend vérifiable — un
 * classement faux se voit rarement à l'écran, mais toujours dans un test.
 */

export type MatchScoring = {
  method: TournamentScoringMethod;
  fixed: TournamentFixedScoring;
  rankOffsets: number[];
};

export function scoringForPhase(phase: TournamentPhase): MatchScoring {
  return { method: phase.scoringMethod, fixed: phase.fixedScoring, rankOffsets: phase.rankOffsets };
}

export const DEFAULT_MATCH_SCORING: MatchScoring = {
  method: "fixed",
  fixed: DEFAULT_FIXED_SCORING,
  rankOffsets: DEFAULT_RANK_OFFSETS,
};

// Points « rank_offset » d'un joueur : N + offset[rang], N = nombre de joueurs
// du match, rang déterminé par les parties gagnées (score). Les ex æquo
// partagent le même rang ; au-delà du tableau, on réutilise le dernier offset.
function rankOffsetPoints(match: TournamentMatch, playerId: string, offsets: number[]): number {
  const n = match.players.length;
  const self = match.players.find((p) => p.playerId === playerId);
  if (!self) return 0;
  const rankIndex = match.players.filter((p) => p.score > self.score).length;
  const offset = offsets[Math.min(rankIndex, offsets.length - 1)] ?? 0;
  return n + offset;
}

/**
 * Cumul des statistiques secondaires d'un joueur sur un match. Un match gagné
 * sans être joué (BYE ou forfait de l'adversaire) crédite les valeurs de bye du
 * preset : le document Shatterpoint chiffre explicitement ce que vaut un bye.
 */
function matchStatsForPlayer(
  match: TournamentMatch,
  playerId: string,
  statKeys: string[],
  presetByeStats: Record<string, number>,
  wonWithoutPlaying: boolean
): Record<string, number> {
  const totals: Record<string, number> = {};
  if (statKeys.length === 0) return totals;

  if (wonWithoutPlaying) {
    for (const key of statKeys) totals[key] = presetByeStats[key] ?? 0;
    return totals;
  }

  for (const game of match.games) {
    const playerStats = game.stats?.[playerId];
    if (!playerStats) continue;
    for (const key of statKeys) {
      const value = playerStats[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }
  return totals;
}

/**
 * Compare deux classements selon une chaîne de départage. Tous les critères se
 * lisent « le plus grand d'abord » ; une valeur absente compte pour zéro, ce
 * qui place naturellement en dessous un joueur qui n'a rien marqué.
 */
function compareByTiebreakers(
  a: PlayerStanding,
  b: PlayerStanding,
  tiebreakers: TiebreakerKey[]
): number {
  for (const tiebreaker of tiebreakers) {
    let left: number;
    let right: number;
    if (tiebreaker.startsWith("stat:")) {
      const key = tiebreaker.slice("stat:".length);
      left = a.stats?.[key] ?? 0;
      right = b.stats?.[key] ?? 0;
    } else if (tiebreaker === "omw") {
      left = a.opponentMatchWinPercentage ?? 0;
      right = b.opponentMatchWinPercentage ?? 0;
    } else if (tiebreaker === "gamesDiff") {
      left = a.gamesDiff;
      right = b.gamesDiff;
    } else {
      left = a.gamesWon;
      right = b.gamesWon;
    }
    if (left !== right) return right - left;
  }
  return 0;
}

/**
 * Classement multijoueur, sensible au scoring de chaque match (résolu via
 * `scoringFor`). Généralise le calcul 2-joueurs de lib/utils/pairing.ts.
 * - wins/losses/draws et OMW% dérivent des vainqueurs (winnerIds) ;
 * - matchPoints selon la méthode de la phase (fixed ou rank_offset) ;
 * - BYE (1 seul joueur) = victoire automatique ;
 * - une double défaite (`resolution: "double-loss"`) fait perdre tout le monde,
 *   contrairement au match nul auquel elle ressemble (winnerIds vide) ;
 * - les statistiques secondaires du preset sont cumulées et servent aux
 *   départages, dans l'ordre donné par `tiebreakers`.
 */
export function calculateMultiplayerStandings(
  playerIds: string[],
  matches: TournamentMatch[],
  scoringFor: (match: TournamentMatch) => MatchScoring = () => DEFAULT_MATCH_SCORING,
  preset?: GameTournamentPreset,
  tiebreakers: TiebreakerKey[] = presetTiebreakers(preset)
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>();
  const statKeys = presetStatKeys(preset);
  const presetByeStats = byeStats(preset);

  playerIds.forEach((playerId) => {
    standings.set(playerId, {
      playerId,
      wins: 0,
      losses: 0,
      draws: 0,
      matchPoints: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      ...(statKeys.length > 0
        ? { stats: Object.fromEntries(statKeys.map((key) => [key, 0])) }
        : {}),
    });
  });

  const completedMatches = matches.filter((m) => m.status === "completed");

  for (const match of completedMatches) {
    const isBye = match.players.length === 1;
    const totalScore = match.players.reduce((sum, p) => sum + p.score, 0);
    const isDoubleLoss = match.resolution === "double-loss";
    const isDraw = !isBye && !isDoubleLoss && match.winnerIds.length === 0;
    const scoring = scoringFor(match);

    for (const matchPlayer of match.players) {
      const standing = standings.get(matchPlayer.playerId);
      if (!standing) continue;

      standing.gamesWon += matchPlayer.score;
      standing.gamesLost += totalScore - matchPlayer.score;

      const isWinner = isBye || (!isDoubleLoss && match.winnerIds.includes(matchPlayer.playerId));
      if (isWinner) {
        standing.wins++;
      } else if (isDraw) {
        standing.draws++;
      } else {
        standing.losses++;
      }

      if (scoring.method === "rank_offset") {
        standing.matchPoints += rankOffsetPoints(match, matchPlayer.playerId, scoring.rankOffsets);
      } else if (isWinner) {
        standing.matchPoints += scoring.fixed.win;
      } else if (isDraw) {
        standing.matchPoints += scoring.fixed.draw;
      } else {
        standing.matchPoints += scoring.fixed.loss;
      }

      if (standing.stats) {
        const wonWithoutPlaying = isWinner && (isBye || match.resolution === "forfeit");
        const gained = matchStatsForPlayer(
          match,
          matchPlayer.playerId,
          statKeys,
          presetByeStats,
          wonWithoutPlaying
        );
        for (const key of statKeys) {
          standing.stats[key] += gained[key] ?? 0;
        }
      }
    }
  }

  standings.forEach((standing) => {
    standing.gamesDiff = standing.gamesWon - standing.gamesLost;
  });

  // Opponent match win percentage (tiebreaker) : moyenne du taux de victoire
  // de tous les adversaires rencontrés (co-joueurs des matchs terminés).
  standings.forEach((standing) => {
    const opponentIds = completedMatches
      .filter((m) => m.players.some((p) => p.playerId === standing.playerId))
      .flatMap((m) => m.players.map((p) => p.playerId))
      .filter((id) => id !== standing.playerId);

    if (opponentIds.length > 0) {
      const totalOpponentWinPercentage = opponentIds.reduce((sum, oppId) => {
        const opp = standings.get(oppId);
        if (!opp) return sum;
        const totalMatches = opp.wins + opp.losses + opp.draws;
        return sum + (totalMatches > 0 ? opp.wins / totalMatches : 0);
      }, 0);
      standing.opponentMatchWinPercentage = totalOpponentWinPercentage / opponentIds.length;
    }
  });

  return Array.from(standings.values()).sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    return compareByTiebreakers(a, b, tiebreakers);
  });
}
