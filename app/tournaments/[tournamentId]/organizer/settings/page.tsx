import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAllGames } from "@/lib/db/games";
import {
  canManageTournament,
  getTournamentById,
  isTournamentOrganizer,
  listTournamentStaff,
} from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { SettingsSection } from "../SettingsSection";
import { StaffManager } from "../StaffManager";

export default async function OrganizerSettingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) notFound();
  if (!canManageTournament(tournament, session.user.id)) redirect("/tournaments");

  // Seuls les organisateurs peuvent supprimer le tournoi et gérer le staff ;
  // les arbitres voient la configuration et la liste du staff en lecture seule.
  const isOrganizer = isTournamentOrganizer(tournament, session.user.id);

  const [games, staff] = await Promise.all([
    getAllGames().then((all) =>
      all
        .map((game) => ({ id: game.id, name: game.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    ),
    listTournamentStaff(tournament),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="settings">
        <div className="space-y-4">
          <SettingsSection tournament={tournament} games={games} canDelete={isOrganizer} />
          <StaffManager tournamentId={tournamentId} initialStaff={staff} canEdit={isOrganizer} />
        </div>
      </OrganizerShell>
    </div>
  );
}
