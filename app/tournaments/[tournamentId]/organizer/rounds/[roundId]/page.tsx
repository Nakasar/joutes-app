import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getRoundById,
  getTournamentById,
  isTournamentOrganizer,
  listMatchesByRound,
  listPlayers,
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

  const [matches, players] = await Promise.all([
    listMatchesByRound(tournamentId, roundId),
    listPlayers(tournamentId),
  ]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <OrganizerRoundClient
        tournamentId={tournamentId}
        round={round}
        initialMatches={matches}
        players={players}
      />
    </div>
  );
}
