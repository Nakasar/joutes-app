import { redirect } from "next/navigation";
import { listMatchesByPhase, listMatchesByRound, listRounds } from "@/lib/db/tournaments";
import { BracketTree } from "../BracketTree";
import { RoundHeaderBar } from "../RoundHeaderBar";
import { RoundSubNav } from "../RoundSubNav";
import { loadOrganizerRoundContext } from "../roundContext";

export default async function OrganizerRoundBracketPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const { round, phase, players } = await loadOrganizerRoundContext(tournamentId, roundId);

  // L'arbre n'a de sens que pour les phases en arbre d'élimination.
  if (phase.type !== "bracket") {
    redirect(`/tournaments/${tournamentId}/organizer/rounds/${roundId}/matches`);
  }

  const [phaseRounds, phaseMatches, roundMatches] = await Promise.all([
    listRounds(tournamentId, phase.id),
    listMatchesByPhase(tournamentId, phase.id),
    listMatchesByRound(tournamentId, roundId),
  ]);

  return (
    <>
      <RoundHeaderBar
        tournamentId={tournamentId}
        roundId={roundId}
        roundNumber={round.number}
        plannedRounds={phase.plannedRounds}
        phaseName={phase.name}
        tableCount={roundMatches.length}
      />
      <div className="space-y-4 p-6">
        <RoundSubNav tournamentId={tournamentId} roundId={roundId} active="bracket" showBracket />
        <BracketTree
          tournamentId={tournamentId}
          rounds={phaseRounds}
          matches={phaseMatches}
          players={players}
          currentRoundId={roundId}
        />
      </div>
    </>
  );
}
