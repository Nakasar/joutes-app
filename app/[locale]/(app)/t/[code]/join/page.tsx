import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth.ts";
import { getTournamentByJoinCode, listPlayers } from "@/lib/db/tournaments.ts";
import { JoinTournamentClient } from "./JoinTournamentClient.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function JoinTournamentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const tournament = await getTournamentByJoinCode(code);
  if (!tournament) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const players = await listPlayers(tournament.id);
  const alreadyJoined = !!session?.user && players.some((p) => p.userId === session.user.id);

  return (
    <div className="mx-auto max-w-lg p-8">
      <JoinTournamentClient
        code={code}
        tournamentId={tournament.id}
        name={tournament.name}
        status={tournament.status}
        preRegistration={tournament.settings.preRegistration}
        playerCount={players.filter((p) => p.status !== "dropped").length}
        isLoggedIn={!!session?.user}
        alreadyJoined={alreadyJoined}
      />
    </div>
  );
}
