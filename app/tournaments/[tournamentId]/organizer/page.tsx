import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getTournamentById,
  isTournamentOrganizer,
  listPhases,
  listPlayers,
  listRounds,
} from "@/lib/db/tournaments";
import { OrganizerClient } from "./OrganizerClient";

export default async function TournamentOrganizerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

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

  const [players, phases, rounds] = await Promise.all([
    listPlayers(tournamentId),
    listPhases(tournamentId),
    listRounds(tournamentId),
  ]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <OrganizerClient
        tournament={tournament}
        initialPlayers={players}
        initialPhases={phases}
        initialRounds={rounds}
      />
    </div>
  );
}
