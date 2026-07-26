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

export type OrganizerNavCounts = {
  // Matchs de la ronde courante sans résultat acté, et matchs en litige :
  // les deux pastilles « à traiter » de la barre latérale.
  pendingMatches: number;
  disputedMatches: number;
  // Pointage à l'arrivée : joueurs présents sur joueurs inscrits.
  checkedInPlayers: number;
  totalPlayers: number;
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

  const activePhase =
    phases.find((p) => p.id === tournament.currentPhaseId) ??
    phases.find((p) => p.status === "in-progress") ??
    null;

  // Ronde courante, cible du lien « Ronde en cours ». Les numéros de ronde
  // repartent à 1 à chaque phase : on ne peut pas les trier globalement. On
  // cherche donc d'abord dans la phase active, puis à défaut la ronde la plus
  // récemment créée — `createdAt` est le seul ordre valable d'une phase à l'autre.
  const byCreation = [...rounds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const inPhase = activePhase ? byCreation.filter((r) => r.phaseId === activePhase.id) : [];
  const currentRound =
    inPhase.filter((r) => r.status === "in-progress").pop() ??
    inPhase[inPhase.length - 1] ??
    byCreation.filter((r) => r.status === "in-progress").pop() ??
    byCreation[byCreation.length - 1] ??
    null;

  const currentMatches = currentRound ? await listMatchesByRound(tournamentId, currentRound.id) : [];

  const counts: OrganizerNavCounts = {
    pendingMatches: currentMatches.filter((m) => m.status === "pending").length,
    disputedMatches: currentMatches.filter((m) => m.status === "disputed").length,
    checkedInPlayers: players.filter((p) => p.checkedInAt).length,
    // Les joueurs retirés ne sont plus attendus : ils sortent du dénominateur
    // du pointage, sinon le compteur ne peut jamais être complet.
    totalPlayers: players.filter((p) => p.status !== "dropped").length,
  };

  return { session, tournament, phases, rounds: byCreation, players, currentRound, activePhase, counts };
}
