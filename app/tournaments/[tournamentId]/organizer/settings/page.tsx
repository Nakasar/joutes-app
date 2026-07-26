import { getAllGames } from "@/lib/db/games";
import { ensureJoinCode, isTournamentOrganizer, listTournamentStaff } from "@/lib/db/tournaments";
import { SettingsSection } from "../SettingsSection";
import { StaffManager } from "../StaffManager";
import { loadOrganizerContext } from "../organizerContext";

export default async function OrganizerSettingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { session, tournament, phases, players } = await loadOrganizerContext(tournamentId);

  // Seuls les organisateurs peuvent supprimer le tournoi et gérer le staff ;
  // les arbitres voient la configuration et la liste du staff en lecture seule.
  const isOrganizer = isTournamentOrganizer(tournament, session.user.id);

  const [games, staff, joinCode] = await Promise.all([
    getAllGames().then((all) =>
      all
        .map((game) => ({ id: game.id, name: game.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    ),
    listTournamentStaff(tournament),
    ensureJoinCode(tournamentId),
  ]);

  return (
    <div className="p-6">
      <SettingsSection
        tournament={tournament}
        games={games}
        canDelete={isOrganizer}
        joinCode={joinCode}
        phases={phases.map((p) => ({
          name: p.name,
          type: p.type,
          bestOf: p.bestOf,
          plannedRounds: p.plannedRounds,
          topCut: p.topCut,
        }))}
        registeredCount={players.filter((p) => p.status !== "dropped").length}
      />
      <div className="mt-4">
        <StaffManager tournamentId={tournamentId} initialStaff={staff} canEdit={isOrganizer} />
      </div>
    </div>
  );
}
