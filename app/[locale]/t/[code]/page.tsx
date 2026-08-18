import { notFound, redirect } from "next/navigation";
import { getTournamentByJoinCode, getTournamentByLiveCode } from "@/lib/db/tournaments";
import { ProjectionScreen } from "./ProjectionScreen";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
export default async function TournamentProjectionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
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
