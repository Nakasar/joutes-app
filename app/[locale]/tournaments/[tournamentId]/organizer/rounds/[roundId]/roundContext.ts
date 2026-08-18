import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getPhaseById,
  getRoundById,
  getTournamentById,
  canManageTournament,
  listFeatAwards,
  listMatchesByRound,
  listPhases,
  listPlayers,
  listRounds,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import { getTournamentLeagueContext } from "@/lib/leagues/tournament-results";

/**
 * Chargement commun aux sous-pages de détail d'une ronde (matchs / classement) :
 * authentifie l'organisateur, résout la ronde et prépare la navigation entre
 * toutes les rondes de toutes les phases. Effectue les redirections/notFound.
 */
export async function loadOrganizerRoundContext(tournamentId: string, roundId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) notFound();
  if (!canManageTournament(tournament, session.user.id)) redirect("/tournaments");

  const round = await getRoundById(tournamentId, roundId);
  if (!round) notFound();

  const [matches, players, phase, phases, allRounds, featAwards, league] = await Promise.all([
    listMatchesByRound(tournamentId, roundId),
    listPlayers(tournamentId),
    getPhaseById(tournamentId, round.phaseId),
    listPhases(tournamentId),
    listRounds(tournamentId),
    // Toutes les attributions du tournoi, pas seulement celles de la ronde :
    // l'arbitre a besoin de voir combien de fois un joueur a déjà reçu un haut
    // fait avant de le lui décerner à nouveau.
    listFeatAwards(tournamentId),
    getTournamentLeagueContext(tournament),
  ]);

  if (!phase) notFound();

  const phaseRounds = allRounds
    .filter((r) => r.phaseId === round.phaseId)
    .sort((a, b) => a.number - b.number);
  // Un match n'est supprimable que dans la dernière ronde de sa phase.
  const isLastRound = phaseRounds[phaseRounds.length - 1]?.id === round.id;

  // Rouvrir cette ronde annulera les phases démarrées après la sienne
  // (suppression de leurs rondes/matchs, restauration des joueurs éliminés).
  const phaseIndex = phases.findIndex((p) => p.id === round.phaseId);
  const reopenCascades = phases.some((p, i) => i > phaseIndex && p.status !== "not-started");

  return {
    tournament,
    round,
    phase,
    matches,
    players: players.map(sanitizePlayer),
    isLastRound,
    reopenCascades,
    feats: league?.feats ?? [],
    featAwards: featAwards.map((award) => ({
      id: award.id,
      playerId: award.playerId,
      featId: award.featId,
      matchId: award.matchId,
    })),
  };
}
