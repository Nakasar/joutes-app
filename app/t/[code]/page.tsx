import { notFound } from "next/navigation";
import { getTournamentByJoinCode } from "@/lib/db/tournaments";
import { ProjectionScreen } from "./ProjectionScreen";

/**
 * Écran de la salle, joignable à l'URL courte affichée sur le panneau de
 * projection de l'organisateur. Public et en lecture seule : la machine du
 * vidéoprojecteur n'a besoin d'aucune session, et le contenu est piloté à
 * distance depuis « Salle & annonces ».
 *
 * Même code court que `/t/:code/join` : l'organisateur n'a qu'un code à
 * communiquer, celui déjà porté par le QR et la carte de participation.
 */
export default async function TournamentProjectionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const tournament = await getTournamentByJoinCode(code);
  if (!tournament) {
    notFound();
  }

  return <ProjectionScreen tournamentId={tournament.id} />;
}
