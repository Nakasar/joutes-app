import { MatchResult } from "@/lib/schemas/event-portal.schema";

export type PlayerStanding = {
  playerId: string;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number; // 3 points pour une victoire, 1 pour un nul, 0 pour une défaite
  gamesWon: number;
  gamesLost: number;
  gamesDiff: number;
  opponentMatchWinPercentage?: number; // Pour le tiebreaker
};

export type PairingResult = {
  player1Id: string;
  player2Id: string;
};

/**
 * Calcule le classement des joueurs à partir des résultats de matchs
 */
export function calculateStandings(
  playerIds: string[],
  matches: MatchResult[]
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>();

  // Initialiser les standings pour tous les joueurs
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
    });
  });

  // Calculer les statistiques à partir des matchs terminés
  matches
    .filter((m) => m.status === "completed")
    .forEach((match) => {
      const p1 = standings.get(match.player1Id);
      const p2 = standings.get(match.player2Id);

      if (!p1 || !p2) return;

      // Mettre à jour les scores de jeux
      p1.gamesWon += match.player1Score;
      p1.gamesLost += match.player2Score;
      p2.gamesWon += match.player2Score;
      p2.gamesLost += match.player1Score;

      // Mettre à jour les victoires/défaites/nuls
      if (match.winnerId === match.player1Id) {
        p1.wins++;
        p1.matchPoints += 3;
        p2.losses++;
      } else if (match.winnerId === match.player2Id) {
        p2.wins++;
        p2.matchPoints += 3;
        p1.losses++;
      } else {
        // Nul
        p1.draws++;
        p2.draws++;
        p1.matchPoints += 1;
        p2.matchPoints += 1;
      }
    });

  // Calculer les différences de jeux
  standings.forEach((standing) => {
    standing.gamesDiff = standing.gamesWon - standing.gamesLost;
  });

  // Calculer l'opponent match win percentage (tiebreaker)
  standings.forEach((standing) => {
    const opponentIds = matches
      .filter(
        (m) =>
          m.status === "completed" &&
          (m.player1Id === standing.playerId || m.player2Id === standing.playerId)
      )
      .map((m) =>
        m.player1Id === standing.playerId ? m.player2Id : m.player1Id
      );

    if (opponentIds.length > 0) {
      const totalOpponentWinPercentage = opponentIds.reduce((sum, oppId) => {
        const opp = standings.get(oppId);
        if (!opp) return sum;
        const totalMatches = opp.wins + opp.losses + opp.draws;
        return sum + (totalMatches > 0 ? opp.wins / totalMatches : 0);
      }, 0);
      standing.opponentMatchWinPercentage =
        totalOpponentWinPercentage / opponentIds.length;
    }
  });

  // Trier les standings
  return Array.from(standings.values()).sort((a, b) => {
    // 1. Points de match
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    // 2. Opponent match win percentage
    if ((b.opponentMatchWinPercentage || 0) !== (a.opponentMatchWinPercentage || 0)) {
      return (b.opponentMatchWinPercentage || 0) - (a.opponentMatchWinPercentage || 0);
    }
    // 3. Différence de jeux
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    // 4. Jeux gagnés
    return b.gamesWon - a.gamesWon;
  });
}

/**
 * Mélange un tableau de manière aléatoire (Fisher-Yates shuffle)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Vérifie si deux joueurs ont déjà joué ensemble
 */
function havePlayedTogether(
  player1Id: string,
  player2Id: string,
  matches: MatchResult[]
): boolean {
  return matches.some(
    (m) =>
      (m.player1Id === player1Id && m.player2Id === player2Id) ||
      (m.player1Id === player2Id && m.player2Id === player1Id)
  );
}

/**
 * Génère les pairings pour une ronde suisse
 */
export function generateSwissPairings(
  playerIds: string[],
  matches: MatchResult[],
  roundNumber: number
): PairingResult[] {
  const pairings: PairingResult[] = [];

  // Si c'est la première ronde, apparier aléatoirement
  if (roundNumber === 1) {
    const shuffled = shuffleArray([...playerIds]);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      pairings.push({
        player1Id: shuffled[i],
        player2Id: shuffled[i + 1],
      });
    }
    return pairings;
  }

  // Pour les rondes suivantes, apparier selon le classement
  const standings = calculateStandings(playerIds, matches);
  const availablePlayers = [...standings];

  while (availablePlayers.length >= 2) {
    const player1 = availablePlayers.shift()!;
    let paired = false;

    // Essayer de trouver un adversaire qui n'a pas encore joué contre player1
    for (let i = 0; i < availablePlayers.length; i++) {
      const player2 = availablePlayers[i];
      if (!havePlayedTogether(player1.playerId, player2.playerId, matches)) {
        pairings.push({
          player1Id: player1.playerId,
          player2Id: player2.playerId,
        });
        availablePlayers.splice(i, 1);
        paired = true;
        break;
      }
    }

    // Si aucun adversaire n'a été trouvé (tous ont déjà joué), prendre le premier disponible
    if (!paired && availablePlayers.length > 0) {
      const player2 = availablePlayers.shift()!;
      pairings.push({
        player1Id: player1.playerId,
        player2Id: player2.playerId,
      });
    }
  }

  // S'il reste un joueur impair, il a un "bye" (ne joue pas cette ronde)
  // On ne crée pas de match pour lui dans cette implémentation

  return pairings;
}

/**
 * Génère un bracket d'élimination simple
 */
export function generateEliminationBracket(
  playerIds: string[],
  matches: MatchResult[]
): PairingResult[] {
  // Calculer le classement pour seeder les joueurs
  const standings = calculateStandings(playerIds, matches);
  
  // Arrondir à la prochaine puissance de 2 pour le nombre de joueurs
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(playerIds.length)));
  const pairings: PairingResult[] = [];

  // Seeding classique: 1 vs dernier, 2 vs avant-dernier, etc.
  const seededPlayers = standings.map(s => s.playerId);
  
  // Si le nombre de joueurs n'est pas une puissance de 2, certains auront un "bye"
  const numByes = bracketSize - playerIds.length;
  
  // Créer les pairings pour le premier tour
  const halfSize = bracketSize / 2;
  for (let i = 0; i < halfSize; i++) {
    const topSeed = i;
    const bottomSeed = bracketSize - 1 - i;
    
    // Vérifier que les deux joueurs existent
    if (topSeed < seededPlayers.length && bottomSeed < seededPlayers.length) {
      pairings.push({
        player1Id: seededPlayers[topSeed],
        player2Id: seededPlayers[bottomSeed],
      });
    }
    // Si seulement le top seed existe, il passe automatiquement (bye)
  }

  return pairings;
}

/**
 * Génère les positions de bracket pour un match
 * Ex: Round 1: QF1, QF2, QF3, QF4 (Quarter Finals)
 *     Round 2: SF1, SF2 (Semi Finals)
 *     Round 3: F (Final)
 */
export function generateBracketPosition(
  matchIndex: number,
  totalMatches: number
): string {
  if (totalMatches === 1) return "F"; // Final
  if (totalMatches === 2) return `SF${matchIndex + 1}`; // Semi-Finals
  if (totalMatches === 4) return `QF${matchIndex + 1}`; // Quarter-Finals
  if (totalMatches === 8) return `R16-${matchIndex + 1}`; // Round of 16
  return `R${matchIndex + 1}`; // Default
}

/**
 * Calcule le nombre de matchs pour un bracket d'élimination
 */
export function calculateBracketRounds(numPlayers: number): number {
  return Math.ceil(Math.log2(numPlayers));
}
