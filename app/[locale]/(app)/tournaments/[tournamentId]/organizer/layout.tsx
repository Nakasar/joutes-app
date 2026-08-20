import type { ReactNode } from "react";
import { OrganizerShell } from "./OrganizerShell.tsx";
import { loadOrganizerContext } from "./organizerContext.ts";

// Blocage délibéré, pas une étape d'adoption restante.
//
// `loadOrganizerContext` authentifie et redirige — vers `/login` sans session,
// vers `/tournaments` sans droit sur ce tournoi. Prérendre le cadre reviendrait
// à montrer une barre latérale d'organisateur à quelqu'un qu'on s'apprête à
// renvoyer : il n'y a pas de coquille qui vaille la peine d'être affichée avant
// que cette porte ait répondu. C'est le motif que la documentation Next cite
// pour garder une route bloquante (« auth, tenant, or other gating in a
// layout »).
//
// Les seize pages du portail, elles, ne portent plus d'opt-out : la barre
// latérale reste montée d'une section à l'autre, et seule la zone de contenu
// passe par son squelette.
export const instant = false;

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
