import { listMatchesByRound } from "@/lib/db/tournaments";
import { RoundHeaderBar } from "../RoundHeaderBar";
import { RoundStandingsPanel } from "../RoundStandingsPanel";
import { RoundSubNav } from "../RoundSubNav";
import { loadOrganizerRoundContext } from "../roundContext";

export default async function OrganizerRoundStandingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const { round, phase } = await loadOrganizerRoundContext(tournamentId, roundId);
  const roundMatches = await listMatchesByRound(tournamentId, roundId);

  return (
    <>
      <RoundHeaderBar
        tournamentId={tournamentId}
        roundId={roundId}
        roundNumber={round.number}
        plannedRounds={phase.plannedRounds}
        phaseName={phase.name}
        tableCount={roundMatches.length}
        deadlineAt={round.deadlineAt?.toISOString()}
        scenarioName={round.scenario?.name}
      />
      <div className="space-y-4 p-6">
        <RoundSubNav
          tournamentId={tournamentId}
          roundId={roundId}
          active="standings"
          showBracket={phase.type === "bracket"}
        />
        <RoundStandingsPanel
          tournamentId={tournamentId}
          roundId={roundId}
          roundStatus={round.status}
          initialStandings={round.standings}
          initialValidatedAt={
            round.standingsValidatedAt
              ? new Date(round.standingsValidatedAt).toISOString()
              : undefined
          }
        />
      </div>
    </>
  );
}
