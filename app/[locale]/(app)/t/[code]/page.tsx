import { connection } from "next/server";
import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { notFound, redirect } from "next/navigation";
import { getTournamentByJoinCode, getTournamentByLiveCode } from "@/lib/db/tournaments.ts";
import { ProjectionScreen } from "./ProjectionScreen.tsx";

/**
 * Écran de la salle, joignable à l'URL courte affichée sur le panneau de
 * projection de l'organisateur. Public et en lecture seule : la machine du
 * vidéoprojecteur n'a besoin d'aucune session, et le contenu est piloté à
 * distance depuis « Salle & annonces ».
 *
 * Le code d'écran (6 caractères) est distinct du code de participation
 * (9 caractères). Les deux se saisissent sous /t/, donc un code de
 * participation tapé sans `/join` est redirigé plutôt que rejeté : les deux
 * codes circulent dans la même salle, la confusion est le cas courant.
 */
async function TournamentProjectionPageContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  // Cet écran est public : aucune lecture de session ne vient désarmer le
  // piège Mongo, dont le pilote touche à l'horloge en cherchant le tournoi.
  await connection();

  const { code } = await params;

  const tournament = await getTournamentByLiveCode(code);
  if (tournament) {
    return <ProjectionScreen tournamentId={tournament.id} />;
  }

  const joining = await getTournamentByJoinCode(code);
  if (joining) {
    redirect(`/t/${code}/join`);
  }

  notFound();
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function TournamentProjectionPage(props: Parameters<typeof TournamentProjectionPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <AccountPanelSkeleton cards={2} label="Chargement de l’écran de salle" />
        </div>
      }
    >
      <TournamentProjectionPageContent {...props} />
    </Suspense>
  );
}
