import { OrganizerShell } from "../../../OrganizerShell";
import { RoundsNav } from "../../RoundsNav";
import { OrganizerRoundClient } from "../OrganizerRoundClient";
import { RoundSubNav } from "../RoundSubNav";
import { loadOrganizerRoundContext } from "../roundContext";

export default async function OrganizerRoundMatchesPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const { tournament, round, phase, matches, players, navPhases, isLastRound } =
    await loadOrganizerRoundContext(tournamentId, roundId);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="rounds">
        <div className="space-y-6">
          <RoundsNav tournamentId={tournamentId} phases={navPhases} currentRoundId={roundId} />
          <RoundSubNav tournamentId={tournamentId} roundId={roundId} active="matches" />
          <OrganizerRoundClient
            tournamentId={tournamentId}
            round={round}
            initialMatches={matches}
            players={players}
            resultMode={phase.resultMode}
            bestOf={phase.bestOf}
            isLastRound={isLastRound}
          />
        </div>
      </OrganizerShell>
    </div>
  );
}
