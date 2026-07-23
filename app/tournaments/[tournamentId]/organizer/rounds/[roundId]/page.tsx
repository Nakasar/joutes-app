import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getPhaseById,
  getRoundById,
  getTournamentById,
  isTournamentOrganizer,
  listMatchesByRound,
  listPlayers,
  listRounds,
  sanitizePlayer,
} from "@/lib/db/tournaments";
import { OrganizerRoundClient } from "./OrganizerRoundClient";

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

  const [matches, players, phase, phaseRounds] = await Promise.all([
    listMatchesByRound(tournamentId, roundId),
    listPlayers(tournamentId),
    getPhaseById(tournamentId, round.phaseId),
    listRounds(tournamentId, round.phaseId),
  ]);

  if (!phase) {
    notFound();
  }

  // Un match n'est supprimable que dans la dernière ronde de sa phase.
  const lastRound = phaseRounds[phaseRounds.length - 1];
  const isLastRound = lastRound?.id === round.id;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <OrganizerRoundClient
        tournamentId={tournamentId}
        round={round}
        initialMatches={matches}
        players={players.map(sanitizePlayer)}
        resultMode={phase.resultMode}
        bestOf={phase.bestOf}
        isLastRound={isLastRound}
      />
    </div>
  );
}
