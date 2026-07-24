import { redirect } from "next/navigation";
import { listMatchesByPhase, listRounds } from "@/lib/db/tournaments";
import { OrganizerShell } from "../../../OrganizerShell";
import { RoundsHeader } from "../../RoundsHeader";
import { BracketTree } from "../BracketTree";
import { RoundSubNav } from "../RoundSubNav";
import { loadOrganizerRoundContext } from "../roundContext";

export default async function OrganizerRoundBracketPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const { tournament, phase, players, navPhases } = await loadOrganizerRoundContext(
    tournamentId,
    roundId
  );

  // L'arbre n'a de sens que pour les phases en arbre d'élimination.
  if (phase.type !== "bracket") {
    redirect(`/tournaments/${tournamentId}/organizer/rounds/${roundId}/matches`);
  }

  const [phaseRounds, phaseMatches] = await Promise.all([
    listRounds(tournamentId, phase.id),
    listMatchesByPhase(tournamentId, phase.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="rounds">
        <div className="space-y-6">
          <RoundsHeader tournamentId={tournamentId} phases={navPhases} currentRoundId={roundId} />
          <RoundSubNav tournamentId={tournamentId} roundId={roundId} active="bracket" showBracket />
          <BracketTree
            tournamentId={tournamentId}
            rounds={phaseRounds}
            matches={phaseMatches}
            players={players}
            currentRoundId={roundId}
          />
        </div>
      </OrganizerShell>
    </div>
  );
}
