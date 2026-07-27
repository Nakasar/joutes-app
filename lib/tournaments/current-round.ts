import type { TournamentPhase, TournamentRound } from "@/lib/types/Tournament";

/**
 * Les numéros de ronde repartent à 1 à chaque phase : ils ne peuvent pas
 * ordonner les rondes d'un bout à l'autre du tournoi. `createdAt` est le seul
 * ordre valable d'une phase à l'autre.
 */
export function sortRoundsByCreation(rounds: TournamentRound[]): TournamentRound[] {
  return [...rounds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Phase active d'un tournoi : celle que l'organisateur a désignée, sinon celle
 * en cours. `null` tant qu'aucune phase n'a démarré — les écrans qui doivent
 * quand même afficher quelque chose se rabattent sur la dernière phase
 * déclarée via `resolveDisplayPhase`.
 */
export function resolveActivePhase(
  phases: TournamentPhase[],
  currentPhaseId?: string
): TournamentPhase | null {
  return (
    phases.find((p) => p.id === currentPhaseId) ??
    phases.find((p) => p.status === "in-progress") ??
    null
  );
}

/**
 * Phase à montrer quand un écran doit afficher un état courant même avant tout
 * démarrage (classement, résumé de la liste des tournois).
 */
export function resolveDisplayPhase(
  phases: TournamentPhase[],
  currentPhaseId?: string
): TournamentPhase | null {
  return resolveActivePhase(phases, currentPhaseId) ?? phases[phases.length - 1] ?? null;
}

/**
 * Ronde courante d'un tournoi. On cherche d'abord dans la phase active — une
 * ronde en cours, à défaut la plus récente — puis à défaut dans tout le
 * tournoi, pour rester juste quand aucune phase n'est marquée en cours.
 */
export function resolveCurrentRound(
  rounds: TournamentRound[],
  activePhaseId?: string
): TournamentRound | null {
  const byCreation = sortRoundsByCreation(rounds);
  const inPhase = activePhaseId ? byCreation.filter((r) => r.phaseId === activePhaseId) : [];

  return (
    inPhase.filter((r) => r.status === "in-progress").pop() ??
    inPhase[inPhase.length - 1] ??
    byCreation.filter((r) => r.status === "in-progress").pop() ??
    byCreation[byCreation.length - 1] ??
    null
  );
}
