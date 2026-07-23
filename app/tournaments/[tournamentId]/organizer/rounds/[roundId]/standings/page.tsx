import { OrganizerShell } from "../../../OrganizerShell";
import { RoundsNav } from "../../RoundsNav";
import { RoundStandingsPanel } from "../RoundStandingsPanel";
import { RoundSubNav } from "../RoundSubNav";
import { loadOrganizerRoundContext } from "../roundContext";

export default async function OrganizerRoundStandingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const { tournament, round, navPhases } = await loadOrganizerRoundContext(tournamentId, roundId);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="rounds">
        <div className="space-y-6">
          <RoundsNav tournamentId={tournamentId} phases={navPhases} currentRoundId={roundId} />
          <RoundSubNav tournamentId={tournamentId} roundId={roundId} active="standings" />
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
      </OrganizerShell>
    </div>
  );
}
