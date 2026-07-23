import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getPhaseById,
  getRoundById,
  getTournamentById,
  isTournamentOrganizer,
  listMatchesByRound,
  listPhases,
  listPlayers,
  listRounds,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import type { RoundsNavPhase } from "../RoundsNav";

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
  if (!isTournamentOrganizer(tournament, session.user.id)) redirect("/tournaments");

  const round = await getRoundById(tournamentId, roundId);
  if (!round) notFound();

  const [matches, players, phase, phases, allRounds] = await Promise.all([
    listMatchesByRound(tournamentId, roundId),
    listPlayers(tournamentId),
    getPhaseById(tournamentId, round.phaseId),
    listPhases(tournamentId),
    listRounds(tournamentId),
  ]);

  if (!phase) notFound();

  const phaseRounds = allRounds
    .filter((r) => r.phaseId === round.phaseId)
    .sort((a, b) => a.number - b.number);
  // Un match n'est supprimable que dans la dernière ronde de sa phase.
  const isLastRound = phaseRounds[phaseRounds.length - 1]?.id === round.id;

  const navPhases: RoundsNavPhase[] = phases.map((p) => ({
    phaseId: p.id,
    phaseName: p.name,
    rounds: allRounds
      .filter((r) => r.phaseId === p.id)
      .sort((a, b) => a.number - b.number)
      .map((r) => ({ id: r.id, number: r.number, validated: !!r.standingsValidatedAt })),
  }));

  return {
    tournament,
    round,
    phase,
    matches,
    players: players.map(sanitizePlayer),
    navPhases,
    isLastRound,
  };
}
