import { PhasesSection } from "../PhasesSection";
import { loadOrganizerContext } from "../organizerContext";

export default async function OrganizerPhasesPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { tournament, phases, rounds, players } = await loadOrganizerContext(tournamentId);

  return (
    <div className="p-6">
      <PhasesSection
        tournamentId={tournamentId}
        initialPhases={phases}
        initialCurrentPhaseId={tournament.currentPhaseId}
        rounds={rounds.map((r) => ({
          id: r.id,
          phaseId: r.phaseId,
          number: r.number,
          status: r.status,
          validated: !!r.standingsValidatedAt,
        }))}
        activePlayerCount={players.filter((p) => p.status !== "dropped").length}
      />
    </div>
  );
}
