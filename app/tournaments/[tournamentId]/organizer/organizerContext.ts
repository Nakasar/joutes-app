import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  canManageTournament,
  getTournamentById,
  listMatchesByRound,
  listPhases,
  listPlayers,
  listRounds,
} from "@/lib/db/tournaments";
import {
  resolveActivePhase,
  resolveCurrentRound,
  sortRoundsByCreation,
} from "@/lib/tournaments/current-round";

export type OrganizerNavCounts = {
  // Matchs de la ronde courante sans résultat acté, et matchs en litige :
  // les deux pastilles « à traiter » de la barre latérale.
  pendingMatches: number;
  disputedMatches: number;
  // Pointage à l'arrivée : joueurs présents sur joueurs inscrits.
  checkedInPlayers: number;
  totalPlayers: number;
  // Le tournoi comporte au moins une phase de puzzle : la section « Puzzle »
  // n'a de raison d'être que là, elle reste masquée partout ailleurs.
  hasPuzzlePhase: boolean;
};

/**
 * Contexte partagé par toutes les pages du portail organisateur : identité du
 * tournoi, ronde en cours et compteurs de la barre latérale. Authentifie et
 * redirige (login / liste des tournois) avant tout rendu.
 */
export async function loadOrganizerContext(tournamentId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) notFound();
  if (!canManageTournament(tournament, session.user.id)) redirect("/tournaments");

  const [phases, rounds, players] = await Promise.all([
    listPhases(tournamentId),
    listRounds(tournamentId),
    listPlayers(tournamentId),
  ]);

  const activePhase = resolveActivePhase(phases, tournament.currentPhaseId);

  // Ronde courante, cible du lien « Ronde en cours ».
  const byCreation = sortRoundsByCreation(rounds);
  const currentRound = resolveCurrentRound(byCreation, activePhase?.id);

  const currentMatches = currentRound ? await listMatchesByRound(tournamentId, currentRound.id) : [];

  const counts: OrganizerNavCounts = {
    pendingMatches: currentMatches.filter((m) => m.status === "pending").length,
    disputedMatches: currentMatches.filter((m) => m.status === "disputed").length,
    checkedInPlayers: players.filter((p) => p.checkedInAt).length,
    // Les joueurs retirés ne sont plus attendus : ils sortent du dénominateur
    // du pointage, sinon le compteur ne peut jamais être complet.
    totalPlayers: players.filter((p) => p.status !== "dropped").length,
    hasPuzzlePhase: phases.some((phase) => phase.type === "time-race"),
  };

  return { session, tournament, phases, rounds: byCreation, players, currentRound, activePhase, counts };
}
