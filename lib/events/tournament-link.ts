import type { Event, RegistrationStatus } from "@/lib/types/Event";
import type { TournamentPlayerStatus } from "@/lib/types/Tournament";

/**
 * Événement et tournoi : qui fait quoi.
 *
 * L'événement est le rendez-vous : une date dans l'agenda, un lieu, les
 * inscriptions, la liste d'attente, les annonces. Le tournoi est le déroulé de
 * la session : joueurs, phases, rondes, classements. Un événement déclare au
 * plus un tournoi (`Tournament.eventId`), et ses inscrits y sont transférés
 * comme joueurs. Voir docs/EVENTS_AND_TOURNAMENTS.md.
 */

// Statut de joueur de tournoi correspondant à un statut d'inscription à
// l'événement. NOT_REGISTERED n'est pas transféré.
const REGISTRATION_TO_PLAYER_STATUS: Partial<Record<RegistrationStatus, TournamentPlayerStatus>> = {
  REGISTERED: "registered",
  PRE_REGISTERED: "pre-registered",
  EXCLUDED: "dropped",
};

/**
 * Statut de joueur d'un inscrit, `null` s'il ne doit pas être transféré. Une
 * inscription sans statut date d'avant les statuts : elle vaut inscription.
 */
export function playerStatusForRegistration(
  status: RegistrationStatus | undefined
): TournamentPlayerStatus | null {
  return REGISTRATION_TO_PLAYER_STATUS[status ?? "REGISTERED"] ?? null;
}

/**
 * Peut organiser l'événement : son créateur et son staff organisateur. C'est
 * aussi le droit de lui associer un tournoi, puisque l'association fait
 * apparaître le tournoi sur la page et y transfère les inscrits.
 */
export function canManageEvent(
  event: Pick<Event, "creatorId" | "staff">,
  userId: string | undefined | null
): boolean {
  if (!userId) return false;
  if (event.creatorId === userId) return true;
  return event.staff?.some((s) => s.userId === userId && s.role === "organizer") ?? false;
}

/** Nombre de changements qu'un transfert appliquerait (ajouts + statuts). */
export function pendingTransferCount(plan: { toAdd: unknown[]; toUpdate: unknown[] }): number {
  return plan.toAdd.length + plan.toUpdate.length;
}
