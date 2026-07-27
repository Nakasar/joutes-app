import { getAllGames } from "@/lib/db/games";
import { getEventById } from "@/lib/db/events";
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

  const [games, staff, joinCode, event] = await Promise.all([
    getAllGames().then((all) =>
      all
        .map((game) => ({ id: game.id, name: game.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    ),
    listTournamentStaff(tournament),
    ensureJoinCode(tournamentId),
    // Un événement supprimé ou devenu illisible ne doit pas casser les réglages :
    // l'écran retombe alors sur l'invitation à en créer un.
    tournament.eventId ? getEventById(tournament.eventId).catch(() => null) : Promise.resolve(null),
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
        event={
          event
            ? {
                id: event.id,
                name: event.name,
                startDateTime: event.startDateTime,
                location: event.lair?.name ?? event.lair?.address ?? undefined,
              }
            : null
        }
      />
      <div className="mt-4">
        <StaffManager tournamentId={tournamentId} initialStaff={staff} canEdit={isOrganizer} />
      </div>
    </div>
  );
}
