import { Suspense } from "react";
import { getAllGames } from "@/lib/db/games.ts";
import { getEventById } from "@/lib/db/events.ts";
import { getLeagueById, getLeaguesManagedBy } from "@/lib/db/leagues.ts";
import { ensureJoinCode, isTournamentOrganizer, listTournamentStaff } from "@/lib/db/tournaments.ts";
import { SettingsSection } from "../SettingsSection.tsx";
import { StaffManager } from "../StaffManager.tsx";
import { loadOrganizerContext } from "../organizerContext.ts";

import { CardSectionSkeleton } from "../OrganizerSkeletons.tsx";

type Params = Promise<{ tournamentId: string }>;

export default function OrganizerSettingsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6"><CardSectionSkeleton cards={4} /></div>}>
      <OrganizerSettingsPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerSettingsPageSection({ params }: { params: Params }) {
  const { tournamentId } = await params;
  const { session, tournament, phases, players } = await loadOrganizerContext(tournamentId);

  // Seuls les organisateurs peuvent supprimer le tournoi et gérer le staff ;
  // les arbitres voient la configuration et la liste du staff en lecture seule.
  const isOrganizer = isTournamentOrganizer(tournament, session.user.id);

  const [games, staff, joinCode, event, leagues, linkedLeague] = await Promise.all([
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
    getLeaguesManagedBy(session.user.id),
    // La ligue rattachée est lue à part : le staff du tournoi n'organise pas
    // forcément la ligue, il doit quand même voir à quoi le tournoi contribue.
    tournament.leagueId
      ? getLeagueById(tournament.leagueId).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Seules les ligues au format POINTS savent quoi faire d'un classement de
  // tournoi ; les autres n'ont pas à encombrer le sélecteur.
  const pointsLeagues = leagues.filter(
    (candidate) =>
      candidate.format === "POINTS" &&
      candidate.status !== "COMPLETED" &&
      candidate.status !== "CANCELLED"
  );

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
        league={linkedLeague ? { id: linkedLeague.id, name: linkedLeague.name } : null}
        manageableLeagues={pointsLeagues.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
        }))}
        canLinkLeague={isOrganizer}
      />
      <div className="mt-4">
        <StaffManager tournamentId={tournamentId} initialStaff={staff} canEdit={isOrganizer} />
      </div>
    </div>
  );
}
