import type { ReactNode } from "react";
import { OrganizerShell } from "./OrganizerShell";
import { loadOrganizerContext } from "./organizerContext";

/**
 * Enveloppe toutes les pages du portail organisateur dans le cadre à barre
 * latérale, et centralise l'authentification : chaque page peut se concentrer
 * sur son contenu.
 */
export default async function OrganizerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { tournament, currentRound, counts } = await loadOrganizerContext(tournamentId);

  return (
    <OrganizerShell
      tournamentId={tournamentId}
      tournamentName={tournament.name}
      status={tournament.status}
      currentRoundId={currentRound?.id}
      counts={counts}
    >
      {children}
    </OrganizerShell>
  );
}
