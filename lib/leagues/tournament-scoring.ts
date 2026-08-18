import type { Feat, PointsRules } from "@/lib/types/League";
import type { TournamentPlayerStatus } from "@/lib/types/Tournament";
import { normalizePointsRules, pointsForRank } from "@/lib/leagues/points-rules";

/**
 * Ce qu'un tournoi rapporte à la ligue qui l'accueille.
 *
 * Module pur, sans accès à la base : c'est la règle du jeu, pas de la
 * persistance — même parti pris que lib/tournaments/standings.ts. Un barème
 * faux se voit rarement à l'écran (le classement de la ligue a toujours l'air
 * plausible), toujours dans un test.
 *
 * Deux propriétés portent tout le reste :
 * - le résultat ne dépend que des entrées, jamais de l'état de la ligue au
 *   moment du calcul, ce qui rend une clôture rejouable à l'identique ;
 * - l'ordre de consommation des limites de hauts faits est déterministe (rang
 *   puis identifiant), sans quoi deux clôtures successives pourraient créditer
 *   des joueurs différents à la limite près.
 */

export type TournamentScoringPlayer = {
  playerId: string;
  /** Absent pour un invité sans compte : il ne peut pas être crédité. */
  userId?: string;
  displayName: string;
  status: TournamentPlayerStatus;
  /** Rang final, 1 = premier. Tel qu'affiché par le classement du tournoi. */
  rank?: number;
  // Bilan du joueur au classement du tournoi. Un BYE y compte comme une
  // victoire (lib/tournaments/standings.ts) : la ligue reprend le classement
  // tel que la salle l'a vu, elle ne le recalcule pas autrement.
  wins: number;
  losses: number;
  draws: number;
};

export type TournamentScoringFeatAward = {
  id: string;
  playerId: string;
  featId: string;
  /** Match du tournoi où le haut fait a été attribué. Absent = fiche joueur. */
  matchId?: string;
};

export type TournamentScoringLineKind = "rank" | "record" | "participation" | "feat";

export type TournamentScoringLine = {
  kind: TournamentScoringLineKind;
  points: number;
  /** Libellé persisté tel quel dans `pointsHistory.reason`. */
  reason: string;
  featId?: string;
  awardId?: string;
  tournamentMatchId?: string;
};

export type TournamentScoringCredit = {
  playerId: string;
  userId: string;
  displayName: string;
  lines: TournamentScoringLine[];
  total: number;
  feats: { featId: string; awardId: string; tournamentMatchId?: string }[];
};

export type TournamentScoringSkippedPlayer = {
  playerId: string;
  displayName: string;
  reason: "no-account";
  /** Ce que le joueur aurait marqué s'il avait eu un compte. */
  wouldHaveScored: number;
};

export type TournamentScoringSkippedFeat = {
  awardId: string;
  playerId: string;
  displayName: string;
  featId: string;
  featTitle: string;
  reason: "unknown-feat" | "no-account" | "max-per-event" | "max-per-league";
};

export type TournamentScoringResult = {
  credits: TournamentScoringCredit[];
  skippedPlayers: TournamentScoringSkippedPlayer[];
  skippedFeats: TournamentScoringSkippedFeat[];
  totalPoints: number;
};

export type TournamentScoringInput = {
  tournament: { name: string };
  rules: PointsRules;
  players: TournamentScoringPlayer[];
  featAwards: TournamentScoringFeatAward[];
  /**
   * Hauts faits déjà détenus dans la ligue *hors de ce tournoi*, par userId
   * puis featId. Sert à faire respecter `maxPerLeague` d'une clôture à l'autre.
   */
  existingFeatCounts?: Record<string, Record<string, number>>;
};

/** « 1er », « 2e », « 3e »… */
function frenchOrdinal(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

function tournamentLabel(name: string): string {
  return `Tournoi « ${name} »`;
}

/**
 * Un joueur pré-inscrit ne s'est pas présenté : il ne marque rien. Un joueur
 * retiré en cours de route garde en revanche ce qu'il a joué — l'abandon n'est
 * pas une sanction rétroactive.
 */
function participates(player: TournamentScoringPlayer): boolean {
  return player.status !== "pre-registered";
}

/**
 * Ordre de traitement stable : le classement d'abord, l'identifiant pour
 * départager. Les limites de hauts faits se consomment dans cet ordre, donc
 * deux calculs sur les mêmes données donnent exactement le même résultat.
 */
function byRankThenId(a: TournamentScoringPlayer, b: TournamentScoringPlayer): number {
  const left = a.rank ?? Number.MAX_SAFE_INTEGER;
  const right = b.rank ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.playerId.localeCompare(b.playerId);
}

/** Bilan « 3V/1N/1D », en n'affichant que ce qui existe. */
function formatRecord(player: TournamentScoringPlayer): string {
  const parts: string[] = [];
  if (player.wins > 0) parts.push(`${player.wins}V`);
  if (player.draws > 0) parts.push(`${player.draws}N`);
  if (player.losses > 0) parts.push(`${player.losses}D`);
  return parts.join("/");
}

/**
 * Répartit les points d'un tournoi entre les participants de la ligue.
 *
 * Quatre sources, cumulables : le rang final, le bilan victoires/nuls/défaites,
 * la participation (par match compté au classement) et les hauts faits.
 * Les lignes à zéro point sont écartées pour que l'historique d'un participant
 * reste lisible.
 */
export function computeTournamentLeagueContribution(
  input: TournamentScoringInput
): TournamentScoringResult {
  const rules = normalizePointsRules(input.rules);
  const label = tournamentLabel(input.tournament.name);
  const featsById = new Map<string, Feat>(rules.feats.map((feat) => [feat.id, feat]));

  const players = [...input.players].sort(byRankThenId);
  const playersById = new Map(players.map((player) => [player.playerId, player]));

  const credits: TournamentScoringCredit[] = [];
  const creditsByPlayerId = new Map<string, TournamentScoringCredit>();
  const skippedPlayers: TournamentScoringSkippedPlayer[] = [];

  for (const player of players) {
    if (!participates(player)) continue;

    const lines: TournamentScoringLine[] = [];

    // 1. Le rang final. Un joueur retiré n'y a pas droit : il n'a pas tenu la
    //    distance, mais il garde ce qu'il a joué (lignes suivantes).
    if (player.rank !== undefined && player.status !== "dropped") {
      const points = pointsForRank(rules, player.rank);
      if (points !== 0) {
        lines.push({
          kind: "rank",
          points,
          reason: `${label} — ${frenchOrdinal(player.rank)}`,
        });
      }
    }

    // 2. Le bilan. Un BYE compte comme une victoire, comme au classement.
    const recordPoints =
      player.wins * rules.victory + player.draws * rules.draw + player.losses * rules.defeat;
    const record = formatRecord(player);
    if (recordPoints !== 0 && record) {
      lines.push({ kind: "record", points: recordPoints, reason: `${label} — ${record}` });
    }

    // 3. La participation, comptée par match comme pour un match de ligue.
    const matchesPlayed = player.wins + player.draws + player.losses;
    const participationPoints = matchesPlayed * rules.participation;
    if (participationPoints !== 0) {
      lines.push({
        kind: "participation",
        points: participationPoints,
        reason: `${label} — participation (${matchesPlayed} match${matchesPlayed > 1 ? "s" : ""})`,
      });
    }

    const wouldHaveScored = lines.reduce((sum, line) => sum + line.points, 0);

    if (!player.userId) {
      // L'invité sans compte n'a personne à créditer dans la ligue. On le
      // signale plutôt que de l'oublier : l'organisateur doit pouvoir décider
      // de l'inviter à créer un compte.
      skippedPlayers.push({
        playerId: player.playerId,
        displayName: player.displayName,
        reason: "no-account",
        wouldHaveScored,
      });
      continue;
    }

    const credit: TournamentScoringCredit = {
      playerId: player.playerId,
      userId: player.userId,
      displayName: player.displayName,
      lines,
      total: wouldHaveScored,
      feats: [],
    };
    credits.push(credit);
    creditsByPlayerId.set(player.playerId, credit);
  }

  // 4. Les hauts faits, dans l'ordre des joueurs puis des attributions.
  const skippedFeats: TournamentScoringSkippedFeat[] = [];
  const playerOrder = new Map(players.map((player, index) => [player.playerId, index]));
  const awards = [...input.featAwards].sort((a, b) => {
    const left = playerOrder.get(a.playerId) ?? Number.MAX_SAFE_INTEGER;
    const right = playerOrder.get(b.playerId) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });

  // Décomptes courants. `perScope` isole chaque match du tournoi ; toutes les
  // attributions faites hors match (depuis la fiche d'un joueur) partagent une
  // seule enveloppe, celle du tournoi.
  const grantedInLeague = new Map<string, number>();
  const grantedInScope = new Map<string, number>();

  for (const award of awards) {
    const player = playersById.get(award.playerId);
    const displayName = player?.displayName ?? award.playerId;
    const feat = featsById.get(award.featId);

    if (!feat) {
      skippedFeats.push({
        awardId: award.id,
        playerId: award.playerId,
        displayName,
        featId: award.featId,
        featTitle: award.featId,
        reason: "unknown-feat",
      });
      continue;
    }

    const credit = creditsByPlayerId.get(award.playerId);
    if (!credit) {
      skippedFeats.push({
        awardId: award.id,
        playerId: award.playerId,
        displayName,
        featId: award.featId,
        featTitle: feat.title,
        reason: "no-account",
      });
      continue;
    }

    const scopeKey = `${award.playerId}:${award.featId}:${award.matchId ?? "sheet"}`;
    const inScope = grantedInScope.get(scopeKey) ?? 0;
    if (feat.maxPerEvent !== undefined && inScope >= feat.maxPerEvent) {
      skippedFeats.push({
        awardId: award.id,
        playerId: award.playerId,
        displayName,
        featId: award.featId,
        featTitle: feat.title,
        reason: "max-per-event",
      });
      continue;
    }

    const leagueKey = `${credit.userId}:${award.featId}`;
    const alreadyHeld = input.existingFeatCounts?.[credit.userId]?.[award.featId] ?? 0;
    const inLeague = alreadyHeld + (grantedInLeague.get(leagueKey) ?? 0);
    if (feat.maxPerLeague !== undefined && inLeague >= feat.maxPerLeague) {
      skippedFeats.push({
        awardId: award.id,
        playerId: award.playerId,
        displayName,
        featId: award.featId,
        featTitle: feat.title,
        reason: "max-per-league",
      });
      continue;
    }

    grantedInScope.set(scopeKey, inScope + 1);
    grantedInLeague.set(leagueKey, (grantedInLeague.get(leagueKey) ?? 0) + 1);

    credit.lines.push({
      kind: "feat",
      points: feat.points,
      reason: `Haut fait: ${feat.title} (${label})`,
      featId: feat.id,
      awardId: award.id,
      tournamentMatchId: award.matchId,
    });
    credit.total += feat.points;
    credit.feats.push({
      featId: feat.id,
      awardId: award.id,
      tournamentMatchId: award.matchId,
    });
  }

  // Un participant qui ne marque rien et n'a obtenu aucun haut fait n'a pas à
  // apparaître dans l'historique de la ligue.
  const kept = credits.filter((credit) => credit.lines.length > 0);

  return {
    credits: kept,
    skippedPlayers,
    skippedFeats,
    totalPoints: kept.reduce((sum, credit) => sum + credit.total, 0),
  };
}
