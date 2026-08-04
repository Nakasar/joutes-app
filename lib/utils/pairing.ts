// Structural view of a match, sufficient for standings and pairing computations.
// Both the event portal's MatchResult and the tournament domain's matches
// satisfy this shape, so the pairing logic stays decoupled from either model.
export type PairingMatch = {
  matchId: string;
  player1Id: string;
  player2Id: string | null;
  player1Score: number;
  player2Score: number;
  // Absent ou null sur un match "completed" = match nul. Le champ reste
  // optionnel pour la compatibilité structurelle avec le MatchResult du
  // portail événement (winnerId optionnel sur les documents existants) —
  // les nouveaux appelants doivent le renseigner explicitement (null pour
  // un nul) plutôt que de l'omettre.
  winnerId?: string | null;
  status: string;
  bracketPosition?: string;
};

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
  // Cumul des statistiques secondaires du preset de la phase (cartes d'objectif,
  // points de victoire…), par clé de statistique. Absent quand la phase n'en
  // utilise pas.
  stats?: Record<string, number>;
  // Temps mis pour résoudre le(s) puzzle(s) pris en compte, en secondes. Absent
  // hors phase puzzle, ou tant que le joueur n'a pas terminé. Le plus petit
  // temps passe devant : c'est le seul critère où « moins » vaut « mieux ».
  puzzleTimeSeconds?: number;
};

export type PairingResult = {
  player1Id: string;
  player2Id: string | null; // null indique un BYE
};

/**
 * Calcule le classement des joueurs à partir des résultats de matchs
 */
export function calculateStandings(
  playerIds: string[],
  matches: PairingMatch[]
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
      
      if (!p1) return;

      // Cas spécial : BYE (player2Id est null)
      if (match.player2Id === null) {
        // Le joueur en BYE gagne automatiquement
        p1.wins++;
        p1.matchPoints += 3;
        p1.gamesWon += match.player1Score;
        p1.gamesLost += match.player2Score;
        return;
      }

      const p2 = standings.get(match.player2Id);
      if (!p2) return;

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
      )
      .filter((oppId) => oppId !== null); // Exclure les BYEs

    if (opponentIds.length > 0) {
      const totalOpponentWinPercentage = opponentIds.reduce((sum, oppId) => {
        const opp = standings.get(oppId as string);
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
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Répartit `n` joueurs en tailles de pods, chacune dans [min, max]. Les
 * joueurs qui ne peuvent pas compléter un pod (reste < min) reçoivent chacun
 * un BYE (taille 1). Exige 1 <= min <= max.
 * Ex: computePodSizes(10, 3, 4) === [4, 3, 3] ; computePodSizes(5, 2, 2) === [2, 2, 1].
 */
export function computePodSizes(n: number, min: number, max: number): number[] {
  const pods: number[] = [];
  let remaining = n;
  while (remaining >= min) {
    let size = Math.min(max, remaining);
    // Éviter de laisser un reste ininscriptible (1..min-1) : réduire ce pod.
    while (size > min && remaining - size > 0 && remaining - size < min) {
      size--;
    }
    pods.push(size);
    remaining -= size;
  }
  // Joueurs restants (< min) : un BYE chacun.
  for (let i = 0; i < remaining; i++) {
    pods.push(1);
  }
  return pods;
}

/**
 * Découpe une liste ordonnée de joueurs en pods dont les tailles respectent
 * [min, max] (voir computePodSizes). Un pod de taille 1 est un BYE.
 */
export function chunkIntoPods(orderedPlayerIds: string[], min: number, max: number): string[][] {
  const sizes = computePodSizes(orderedPlayerIds.length, min, max);
  const groups: string[][] = [];
  let index = 0;
  for (const size of sizes) {
    groups.push(orderedPlayerIds.slice(index, index + size));
    index += size;
  }
  return groups;
}

/**
 * Vérifie si deux joueurs ont déjà joué ensemble
 */
function havePlayedTogether(
  player1Id: string,
  player2Id: string,
  matches: PairingMatch[]
): boolean {
  return matches.some(
    (m) =>
      (m.player1Id === player1Id && m.player2Id === player2Id) ||
      (m.player1Id === player2Id && m.player2Id === player1Id)
  );
}

/**
 * Choisit le joueur qui reçoit le BYE dans une liste ordonnée par classement
 * (meilleur en premier) : le moins bien classé n'en ayant pas encore reçu. Si
 * tous en ont déjà eu un, le moins bien classé le reprend — un joueur doit
 * bien être exempté quand l'effectif est impair.
 */
export function pickByePlayer(orderedPlayerIds: string[], playersWithBye?: Set<string>): string | null {
  if (orderedPlayerIds.length === 0) return null;
  if (playersWithBye) {
    for (let i = orderedPlayerIds.length - 1; i >= 0; i--) {
      if (!playersWithBye.has(orderedPlayerIds[i])) return orderedPlayerIds[i];
    }
  }
  return orderedPlayerIds[orderedPlayerIds.length - 1];
}

// Règle d'appariement au sein d'un même total de points, en phase suisse :
// - ranked : ordre du classement.
// - random-in-bracket : tirage au sort dans chaque groupe de points.
// Miroir de `TournamentSwissPairing`, déclaré ici pour que ce module reste
// indépendant du modèle de tournoi (comme `BracketSeedingMode` plus bas).
export type SwissPairingMode = "ranked" | "random-in-bracket";

export type SwissPairingOptions = {
  // Ordre de classement imposé (ex : classement cumulé multi-phases). Sans lui,
  // l'ordre est déduit des `matches` fournis.
  rankedOrder?: string[];
  // Appariement au sein d'un même total de points. Défaut "ranked".
  mode?: SwissPairingMode;
  // Points de classement d'un joueur, pour constituer les groupes du tirage au
  // sort en mode "random-in-bracket". Fournis par le domaine, qui seul connaît
  // le barème de la phase. Sans eux, le mode retombe sur "ranked".
  matchPointsOf?: (playerId: string) => number;
  // Joueurs ayant déjà reçu un BYE pendant le tournoi : le BYE va en priorité
  // à quelqu'un d'autre.
  playersWithBye?: Set<string>;
};

/**
 * Réordonne une liste classée en tirant au sort à l'intérieur de chaque groupe
 * de joueurs à égalité de points. Les groupes restent ordonnés par points
 * décroissants : le joueur en trop d'un groupe impair sera donc apparié au
 * premier tiré du groupe suivant, ce qui est exactement le flottement attendu.
 */
function shuffleWithinPointGroups(
  orderedPlayerIds: string[],
  matchPointsOf: (playerId: string) => number
): string[] {
  const groups = new Map<number, string[]>();
  for (const playerId of orderedPlayerIds) {
    const points = matchPointsOf(playerId);
    const group = groups.get(points);
    if (group) group.push(playerId);
    else groups.set(points, [playerId]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, group]) => shuffleArray(group));
}

/**
 * Génère les pairings pour une ronde suisse. L'évitement des re-matchs se base
 * toujours sur `matches`.
 */
export function generateSwissPairings(
  playerIds: string[],
  matches: PairingMatch[],
  roundNumber: number,
  options: SwissPairingOptions = {}
): PairingResult[] {
  const { rankedOrder, mode = "ranked", matchPointsOf, playersWithBye } = options;
  const pairings: PairingResult[] = [];

  // Première ronde : appariement entièrement aléatoire. Le BYE, s'il y en a un,
  // revient donc lui aussi au hasard, comme le veut le format.
  if (roundNumber === 1) {
    const shuffled = shuffleArray([...playerIds]);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      pairings.push({
        player1Id: shuffled[i],
        player2Id: shuffled[i + 1],
      });
    }
    // Si nombre impair de joueurs, le dernier a un BYE
    if (shuffled.length % 2 === 1) {
      pairings.push({
        player1Id: shuffled[shuffled.length - 1],
        player2Id: null,
      });
    }
    return pairings;
  }

  // Pour les rondes suivantes, apparier selon le classement.
  const standings = calculateStandings(playerIds, matches);
  let orderedIds = standings.map((standing) => standing.playerId);
  // Ordre de classement imposé (ex : cumul multi-phases) : réordonne les
  // joueurs disponibles en conséquence. Les joueurs absents de `rankedOrder`
  // sont placés en fin ; deux inconnus comparent à 0 (tri stable → ordre
  // existant conservé), ce qui évite tout `Infinity - Infinity` (NaN).
  if (rankedOrder) {
    const rankById = new Map(rankedOrder.map((id, index) => [id, index]));
    const rankOf = (playerId: string) => rankById.get(playerId) ?? rankedOrder.length;
    orderedIds = [...orderedIds].sort((a, b) => rankOf(a) - rankOf(b));
  }

  // Le BYE est attribué avant tout appariement : le retirer d'abord évite qu'il
  // échoie mécaniquement au dernier joueur non apparié, qui n'est pas forcément
  // celui qui doit le recevoir.
  if (orderedIds.length % 2 === 1) {
    const byePlayerId = pickByePlayer(orderedIds, playersWithBye);
    if (byePlayerId) {
      pairings.push({ player1Id: byePlayerId, player2Id: null });
      orderedIds = orderedIds.filter((id) => id !== byePlayerId);
    }
  }

  const availablePlayers =
    mode === "random-in-bracket" && matchPointsOf
      ? shuffleWithinPointGroups(orderedIds, matchPointsOf)
      : orderedIds;

  while (availablePlayers.length >= 2) {
    const player1 = availablePlayers.shift()!;
    let paired = false;

    // Essayer de trouver un adversaire qui n'a pas encore joué contre player1
    for (let i = 0; i < availablePlayers.length; i++) {
      const player2 = availablePlayers[i];
      if (!havePlayedTogether(player1, player2, matches)) {
        pairings.push({ player1Id: player1, player2Id: player2 });
        availablePlayers.splice(i, 1);
        paired = true;
        break;
      }
    }

    // Si aucun adversaire n'a été trouvé (tous ont déjà joué), prendre le premier disponible
    if (!paired && availablePlayers.length > 0) {
      const player2 = availablePlayers.shift()!;
      pairings.push({ player1Id: player1, player2Id: player2 });
    }
  }

  // Effectif pair au départ mais un joueur reste isolé : il prend le BYE.
  if (availablePlayers.length === 1) {
    pairings.push({
      player1Id: availablePlayers[0],
      player2Id: null,
    });
  }

  return pairings;
}

// Règle d'appariement de la première ronde d'un bracket, selon l'ordre de
// classement d'entrée :
// - opposite : classement opposé, le 1er affronte le dernier, le 2e
//   l'avant-dernier, etc. (seeding classique).
// - adjacent : classement rapproché, le 1er affronte le 2e, le 3e le 4e, etc.
export type BracketSeedingMode = "opposite" | "adjacent";

/**
 * Génère un bracket d'élimination simple
 * @param playerIds - Liste des IDs des joueurs participants
 * @param matches - Matchs existants (pour calculer le classement)
 * @param topCut - Nombre de joueurs à prendre du top du classement (ex: 8 pour un top 8). Si non spécifié, prend tous les joueurs.
 * @param seeding - Règle d'appariement de la première ronde (défaut : classement opposé)
 */
export function generateEliminationBracket(
  playerIds: string[],
  matches: PairingMatch[],
  topCut?: number,
  seeding: BracketSeedingMode = "opposite"
): PairingResult[] {
  // Calculer le classement pour seeder les joueurs
  const standings = calculateStandings(playerIds, matches);

  // Si un top cut est spécifié, prendre seulement les N premiers du classement
  let selectedPlayers = standings.map(s => s.playerId);
  if (topCut && topCut > 0 && topCut < selectedPlayers.length) {
    selectedPlayers = selectedPlayers.slice(0, topCut);
  }

  const numPlayers = selectedPlayers.length;

  // Arrondir à la prochaine puissance de 2 pour le nombre de joueurs
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
  const pairings: PairingResult[] = [];
  const halfSize = bracketSize / 2;

  if (seeding === "adjacent") {
    // Classement rapproché : les BYE (bracket incomplet) vont aux têtes de
    // série, puis les joueurs restants s'affrontent deux à deux dans l'ordre.
    const byeCount = bracketSize - numPlayers;
    for (let i = 0; i < byeCount; i++) {
      pairings.push({ player1Id: selectedPlayers[i], player2Id: null });
    }
    for (let i = byeCount; i + 1 < numPlayers; i += 2) {
      pairings.push({
        player1Id: selectedPlayers[i],
        player2Id: selectedPlayers[i + 1],
      });
    }
    return pairings;
  }

  // Classement opposé : placement standard des têtes de série (doublement
  // récursif). L'ordre des matchs garantit — avec l'appariement séquentiel des
  // vainqueurs — que le 1er et le 2e ne peuvent se rencontrer qu'en finale, le
  // 3e et le 4e au plus tôt en demi-finale, etc.
  // Ex. 8 joueurs : 1v8, 4v5, 2v7, 3v6 (demi-finales théoriques 1v4 et 2v3).
  let seedOrder = [0];
  while (seedOrder.length < bracketSize) {
    const doubled = seedOrder.length * 2;
    const next: number[] = [];
    for (const seed of seedOrder) {
      next.push(seed, doubled - 1 - seed);
    }
    seedOrder = next;
  }

  for (let i = 0; i < halfSize; i++) {
    // La première position de chaque paire est toujours la meilleure tête de
    // série (< halfSize), donc toujours présente ; l'autre reçoit un BYE si le
    // bracket est incomplet.
    const topSeed = seedOrder[2 * i];
    const bottomSeed = seedOrder[2 * i + 1];
    pairings.push({
      player1Id: selectedPlayers[topSeed],
      player2Id: bottomSeed < numPlayers ? selectedPlayers[bottomSeed] : null,
    });
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

// Comparateur des positions de bracket, à tri numérique (R2 avant R10) pour
// les colonnes de 10 matchs et plus. Partagé entre la génération des rondes et
// l'affichage de l'arbre pour que les deux ordonnent les matchs à l'identique.
const bracketPositionCollator = new Intl.Collator("en", { numeric: true });

export function compareBracketPositions(
  a: Pick<PairingMatch, "matchId" | "bracketPosition">,
  b: Pick<PairingMatch, "matchId" | "bracketPosition">
): number {
  return bracketPositionCollator.compare(
    a.bracketPosition || a.matchId,
    b.bracketPosition || b.matchId
  );
}

/**
 * Génère les pairings pour la ronde suivante d'un bracket en utilisant les vainqueurs
 * @param previousRoundMatches - Matchs de la ronde précédente
 * @returns Les pairings pour la ronde suivante
 */
export function generateNextBracketRound(
  previousRoundMatches: PairingMatch[]
): PairingResult[] {
  // Récupérer les vainqueurs de la ronde précédente dans l'ordre du bracket
  const winners = [...previousRoundMatches]
    .sort(compareBracketPositions)
    .map(match => {
      // Si le match a un vainqueur, le retourner
      if (match.winnerId) {
        return match.winnerId;
      }
      // Si c'est un BYE, le joueur 1 passe automatiquement
      if (!match.player2Id) {
        return match.player1Id;
      }
      // Si le match n'est pas terminé, on ne peut pas générer la ronde suivante
      return null;
    });

  // Vérifier que tous les matchs sont terminés
  if (winners.some(w => w === null)) {
    throw new Error("Tous les matchs de la ronde précédente doivent être terminés");
  }

  // Créer les pairings en associant les vainqueurs deux par deux
  const pairings: PairingResult[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    if (i + 1 < winners.length) {
      pairings.push({
        player1Id: winners[i]!,
        player2Id: winners[i + 1]!,
      });
    } else {
      // Si nombre impair de vainqueurs, le dernier a un BYE
      pairings.push({
        player1Id: winners[i]!,
        player2Id: null,
      });
    }
  }

  return pairings;
}
