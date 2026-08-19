import { Suspense } from "react";
import { listMatchesByRound } from "@/lib/db/tournaments.ts";
import { RoundHeaderBar } from "../RoundHeaderBar.tsx";
import { RoundStandingsPanel } from "../RoundStandingsPanel.tsx";
import { RoundSubNav } from "../RoundSubNav.tsx";
import { loadOrganizerRoundContext } from "../roundContext.ts";

import { RoundStandingsSkeleton } from "../../../OrganizerSkeletons.tsx";

type Params = Promise<{ tournamentId: string; roundId: string }>;

export default function OrganizerRoundStandingsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RoundStandingsSkeleton />}>
      <OrganizerRoundStandingsPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerRoundStandingsPageSection({ params }: { params: Params }) {
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
