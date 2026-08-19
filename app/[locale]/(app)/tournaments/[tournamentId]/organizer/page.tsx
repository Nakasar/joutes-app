import { redirect } from "next/navigation";
import { loadOrganizerContext } from "./organizerContext.ts";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * Entrée du portail organisateur : ouvre sur la ronde en cours quand le tournoi
 * tourne, sinon sur les réglages — l'écran de préparation d'un tournoi qui n'a
 * pas encore démarré.
 */
export default async function TournamentOrganizerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { currentRound } = await loadOrganizerContext(tournamentId);

  redirect(
    currentRound
      ? `/tournaments/${tournamentId}/organizer/rounds/${currentRound.id}/matches`
      : `/tournaments/${tournamentId}/organizer/settings`
  );
}
