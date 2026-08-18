import "server-only";

import {
  addParticipant,
  applyTournamentContribution,
  getLeagueById,
  revertTournamentContribution,
  type TournamentContributionEntry,
} from "@/lib/db/leagues";
import {
  getStandings,
  listFeatAwards,
  listPlayers,
  requireTournament,
} from "@/lib/db/tournaments";
import type { Feat, League } from "@/lib/types/League";
import type { Tournament } from "@/lib/types/Tournament";
import {
  computeTournamentLeagueContribution,
  type TournamentScoringPlayer,
} from "@/lib/leagues/tournament-scoring";

/**
 * Le pont entre un tournoi et la ligue qu'il alimente.
 *
 * C'est le seul module à lire les deux domaines : `lib/db/leagues.ts` ignore
 * tout des tournois et `lib/db/tournaments.ts` ignore tout des ligues, ce qui
 * évite un cycle d'import et garde chaque couche lisible seule. Le calcul lui
 * n'est pas ici : il vit dans le module pur `tournament-scoring.ts`, où il se
 * teste sans base.
 *
 * Toute l'opération repose sur une propriété : **appliquer commence par
 * annuler**. Clôturer deux fois, rouvrir puis reclôturer, corriger un résultat
 * ou changer le barème puis rejouer — tout converge vers le même état.
 */

export type TournamentLeagueReport = {
  leagueId: string;
  leagueName: string;
  tournamentId: string;
  creditedPlayers: number;
  totalPoints: number;
  /** Joueurs inscrits à la ligue au passage, parce qu'ils ont joué. */
  autoEnrolled: { userId: string; displayName: string }[];
  /** Joueurs qui auraient dû l'être mais que la ligue a refusés (ligue pleine). */
  notEnrolled: { displayName: string; reason: string }[];
  /** Invités sans compte : personne à créditer. */
  skippedGuests: { displayName: string; wouldHaveScored: number }[];
  skippedFeats: { displayName: string; featTitle: string; reason: string }[];
};

export class LeagueLinkError extends Error {
  constructor(
    public code: "not-found" | "forbidden" | "conflict",
    message: string
  ) {
    super(message);
    this.name = "LeagueLinkError";
  }
}

/**
 * Vérifie qu'une ligue peut accueillir un tournoi et la renvoie. Le contrôle
 * vit ici plutôt que dans la couche base du tournoi, exactement comme le
 * contrôle de l'événement vit dans la route qui rattache un événement.
 */
export async function requireLinkableLeague(leagueId: string): Promise<League> {
  const league = await getLeagueById(leagueId);
  if (!league) {
    throw new LeagueLinkError("not-found", "Ligue non trouvée");
  }
  if (league.format !== "POINTS") {
    throw new LeagueLinkError(
      "conflict",
      "Seules les ligues au format POINTS peuvent accueillir un tournoi"
    );
  }
  if (!league.pointsConfig) {
    throw new LeagueLinkError("conflict", "Cette ligue n'a pas de barème de points");
  }
  if (league.status === "COMPLETED" || league.status === "CANCELLED") {
    throw new LeagueLinkError("conflict", "Cette ligue est terminée : elle n'accueille plus de tournoi");
  }
  return league;
}

/** Catalogue de hauts faits visible depuis un tournoi. `null` si non rattaché. */
export async function getTournamentLeagueContext(
  tournament: Pick<Tournament, "leagueId">
): Promise<{ leagueId: string; leagueName: string; feats: Feat[] } | null> {
  if (!tournament.leagueId) return null;

  const league = await getLeagueById(tournament.leagueId);
  if (!league || league.format !== "POINTS") return null;

  return {
    leagueId: league.id,
    leagueName: league.name,
    feats: league.pointsConfig?.pointsRules.feats ?? [],
  };
}

/** Retire de la ligue tout ce que ce tournoi lui avait apporté. */
export async function revertTournamentFromLeague(
  tournamentId: string,
  leagueId: string
): Promise<{ removedPoints: number; affectedParticipants: number }> {
  return revertTournamentContribution(leagueId, tournamentId);
}

/**
 * Porte les résultats d'un tournoi clos au crédit de sa ligue.
 *
 * Renvoie `null` si le tournoi n'est rattaché à aucune ligue — appeler cette
 * fonction sur un tournoi autonome n'est pas une erreur, c'est simplement sans
 * effet.
 */
export async function applyTournamentToLeague(
  tournamentId: string
): Promise<TournamentLeagueReport | null> {
  const tournament = await requireTournament(tournamentId);
  if (!tournament.leagueId) return null;

  const league = await requireLinkableLeague(tournament.leagueId);
  const leagueId = league.id;

  const [standings, players, featAwards] = await Promise.all([
    getStandings(tournamentId),
    listPlayers(tournamentId),
    listFeatAwards(tournamentId),
  ]);

  const playersById = new Map(players.map((player) => [player.id, player]));

  // Le rang est la position au classement du tournoi, celle qu'affiche la
  // salle. Un invité sans compte garde donc son rang : les joueurs derrière lui
  // ne remontent pas d'une place parce qu'il n'a pas de compte.
  const scoringPlayers: TournamentScoringPlayer[] = standings.map((standing, index) => ({
    playerId: standing.playerId,
    userId: standing.userId,
    displayName: standing.displayName,
    status: standing.playerStatus,
    rank: index + 1,
    wins: standing.wins,
    losses: standing.losses,
    draws: standing.draws,
  }));

  // Inscription automatique : qui a joué le tournoi entre dans la ligue. Une
  // ligue pleine refuse l'inscription — ce n'est pas une raison pour faire
  // échouer la clôture, on le signale à l'organisateur.
  const alreadyIn = new Set(
    (await getLeagueById(leagueId, { includeParticipants: true }))?.participants.map(
      (participant) => participant.userId
    ) ?? []
  );
  const autoEnrolled: TournamentLeagueReport["autoEnrolled"] = [];
  const notEnrolled: TournamentLeagueReport["notEnrolled"] = [];

  for (const player of scoringPlayers) {
    if (!player.userId || alreadyIn.has(player.userId) || player.status === "pre-registered") {
      continue;
    }
    try {
      await addParticipant(leagueId, player.userId);
      alreadyIn.add(player.userId);
      autoEnrolled.push({ userId: player.userId, displayName: player.displayName });
    } catch (error) {
      notEnrolled.push({
        displayName: player.displayName,
        reason: error instanceof Error ? error.message : "Inscription impossible",
      });
    }
  }

  // On annule avant de compter : les compteurs de hauts faits doivent refléter
  // ce que chacun détient *hors* de ce tournoi, sinon une seconde clôture
  // opposerait au joueur la limite que la première lui a fait atteindre.
  // `applyTournamentContribution` annulera de nouveau, sans effet.
  await revertTournamentContribution(leagueId, tournamentId);
  const refreshed = await getLeagueById(leagueId, { includeParticipants: true });
  // La contribution vient d'être retirée : sans cette relecture on écrirait un
  // crédit vide et on annoncerait un succès, laissant la ligue amputée.
  if (!refreshed) {
    throw new LeagueLinkError("not-found", "Ligue introuvable pendant la clôture du tournoi");
  }

  const existingFeatCounts: Record<string, Record<string, number>> = {};
  for (const participant of refreshed.participants) {
    const counts: Record<string, number> = {};
    for (const feat of participant.feats) {
      counts[feat.featId] = (counts[feat.featId] ?? 0) + 1;
    }
    existingFeatCounts[participant.userId] = counts;
  }

  const enrolled = new Set(refreshed.participants.map((participant) => participant.userId));

  const contribution = computeTournamentLeagueContribution({
    tournament: { name: tournament.name },
    rules: league.pointsConfig!.pointsRules,
    // Un joueur que la ligue a refusé d'inscrire ne peut pas être crédité :
    // sans participant, il n'y a pas d'historique où écrire.
    players: scoringPlayers.filter(
      (player) => !player.userId || enrolled.has(player.userId)
    ),
    featAwards: featAwards.map((awardDoc) => ({
      id: awardDoc.id,
      playerId: awardDoc.playerId,
      featId: awardDoc.featId,
      matchId: awardDoc.matchId,
    })),
    existingFeatCounts,
  });

  // Les lignes sont datées du tournoi, pas de l'instant du calcul : rejouer une
  // clôture en mars ne doit pas faire remonter un tournoi de janvier en tête de
  // l'historique de la ligue.
  const playedAt = tournament.startsAt ?? tournament.createdAt;
  const entries: TournamentContributionEntry[] = contribution.credits.map((credit) => ({
    userId: credit.userId,
    points: credit.total,
    history: credit.lines.map((line) => ({
      date: playedAt,
      points: line.points,
      reason: line.reason,
      featId: line.featId,
      tournamentId,
    })),
    feats: credit.feats.map((feat) => ({
      featId: feat.featId,
      earnedAt: playedAt,
      tournamentMatchId: feat.tournamentMatchId,
    })),
  }));

  await applyTournamentContribution(leagueId, tournamentId, entries);

  return {
    leagueId,
    leagueName: league.name,
    tournamentId,
    creditedPlayers: contribution.credits.length,
    totalPoints: contribution.totalPoints,
    autoEnrolled,
    notEnrolled,
    skippedGuests: contribution.skippedPlayers.map((skipped) => ({
      displayName: skipped.displayName,
      wouldHaveScored: skipped.wouldHaveScored,
    })),
    skippedFeats: contribution.skippedFeats.map((skipped) => ({
      displayName: skipped.displayName,
      featTitle: skipped.featTitle,
      reason: skipped.reason,
    })),
  };
}

/**
 * Décide de ce qu'une modification de tournoi implique pour sa ligue, et
 * l'applique. Un seul endroit pour les quatre transitions possibles :
 * clôture, réouverture, rattachement, détachement.
 */
export async function syncTournamentLeague(
  before: Pick<Tournament, "status" | "leagueId">,
  after: Pick<Tournament, "id" | "status" | "leagueId">
): Promise<TournamentLeagueReport | null> {
  // Rien n'a bougé côté ligue : on ne touche à rien. Sans cette garde, renommer
  // un tournoi clos rejouerait toute sa contribution — et réinscrirait au
  // passage les participants que l'organisateur de la ligue avait retirés.
  if (before.status === after.status && before.leagueId === after.leagueId) {
    return null;
  }

  const wasCredited = before.status === "completed" && Boolean(before.leagueId);
  const leftPreviousLeague = before.leagueId && before.leagueId !== after.leagueId;
  const stoppedBeingClosed = after.status !== "completed";

  if (wasCredited && (leftPreviousLeague || stoppedBeingClosed)) {
    await revertTournamentFromLeague(after.id, before.leagueId!);
  }

  if (after.leagueId && after.status === "completed") {
    return applyTournamentToLeague(after.id);
  }

  return null;
}
