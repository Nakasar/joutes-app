import { Suspense } from "react";
import { getPreset } from "@/lib/tournaments/game-presets.ts";
import { OrganizerRoundClient } from "../OrganizerRoundClient.tsx";
import { RoundHeaderBar } from "../RoundHeaderBar.tsx";
import { RoundSubNav } from "../RoundSubNav.tsx";
import { loadOrganizerRoundContext } from "../roundContext.ts";

import { RoundMatchesSkeleton } from "../../../OrganizerSkeletons.tsx";

type Params = Promise<{ tournamentId: string; roundId: string }>;

export default function OrganizerRoundMatchesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RoundMatchesSkeleton />}>
      <OrganizerRoundMatchesPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerRoundMatchesPageSection({ params }: { params: Params }) {
  const { tournamentId, roundId } = await params;
  const { round, phase, matches, players, isLastRound, reopenCascades, feats, featAwards } =
    await loadOrganizerRoundContext(tournamentId, roundId);

  return (
    <>
      <RoundHeaderBar
        tournamentId={tournamentId}
        roundId={roundId}
        roundNumber={round.number}
        plannedRounds={phase.plannedRounds}
        phaseName={phase.name}
        tableCount={matches.length}
        deadlineAt={round.deadlineAt?.toISOString()}
        scenarioName={round.scenario?.name}
      />
      <div className="px-6 pt-4">
        <RoundSubNav
          tournamentId={tournamentId}
          roundId={roundId}
          active="matches"
          showBracket={phase.type === "bracket"}
        />
      </div>
      <OrganizerRoundClient
        tournamentId={tournamentId}
        round={round}
        initialMatches={matches}
        players={players}
        resultMode={phase.resultMode}
        bestOf={phase.bestOf}
        stats={getPreset(phase.statsPresetKey)?.stats ?? []}
        requireStats={phase.requireMatchStats}
        phaseId={phase.id}
        isLastRound={isLastRound}
        reopenCascades={reopenCascades}
        feats={feats}
        initialFeatAwards={featAwards}
      />
    </>
  );
}
