import { listMatchesByRound } from "@/lib/db/tournaments.ts";
import { RoundHeaderBar } from "../RoundHeaderBar.tsx";
import { RoundStandingsPanel } from "../RoundStandingsPanel.tsx";
import { RoundSubNav } from "../RoundSubNav.tsx";
import { loadOrganizerRoundContext } from "../roundContext.ts";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
