import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getPhaseById,
  getRoundById,
  getTournamentById,
  isTournamentOrganizer,
  listMatchesByRound,
  listPhases,
  listPlayers,
  listRounds,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import { OrganizerRoundClient } from "./OrganizerRoundClient";
import { RoundStandingsPanel } from "./RoundStandingsPanel";
import { RoundsNav, type RoundsNavPhase } from "../RoundsNav";

export default async function OrganizerRoundPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    notFound();
  }
  if (!isTournamentOrganizer(tournament, session.user.id)) {
    redirect("/tournaments");
  }

  const round = await getRoundById(tournamentId, roundId);
  if (!round) {
    notFound();
  }

  const [matches, players, phase, phases, allRounds] = await Promise.all([
    listMatchesByRound(tournamentId, roundId),
    listPlayers(tournamentId),
    getPhaseById(tournamentId, round.phaseId),
    listPhases(tournamentId),
    listRounds(tournamentId),
  ]);

  if (!phase) {
    notFound();
  }

  const phaseRounds = allRounds
    .filter((r) => r.phaseId === round.phaseId)
    .sort((a, b) => a.number - b.number);
  // Un match n'est supprimable que dans la dernière ronde de sa phase.
  const isLastRound = phaseRounds[phaseRounds.length - 1]?.id === round.id;

  const navPhases: RoundsNavPhase[] = phases.map((p) => ({
    phaseId: p.id,
    phaseName: p.name,
    rounds: allRounds
      .filter((r) => r.phaseId === p.id)
      .sort((a, b) => a.number - b.number)
      .map((r) => ({ id: r.id, number: r.number, validated: !!r.standingsValidatedAt })),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <RoundsNav tournamentId={tournamentId} phases={navPhases} currentRoundId={roundId} />

      <OrganizerRoundClient
        tournamentId={tournamentId}
        round={round}
        initialMatches={matches}
        players={players.map(sanitizePlayer)}
        resultMode={phase.resultMode}
        bestOf={phase.bestOf}
        isLastRound={isLastRound}
      />

      <RoundStandingsPanel
        tournamentId={tournamentId}
        roundId={roundId}
        roundStatus={round.status}
        initialStandings={round.standings}
        initialValidatedAt={
          round.standingsValidatedAt ? new Date(round.standingsValidatedAt).toISOString() : undefined
        }
      />
    </div>
  );
}
