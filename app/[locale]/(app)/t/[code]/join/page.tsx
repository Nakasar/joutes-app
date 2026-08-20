import { connection } from "next/server";
import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth.ts";
import { getTournamentByJoinCode, listPlayers } from "@/lib/db/tournaments.ts";
import { JoinTournamentClient } from "./JoinTournamentClient.tsx";

async function JoinTournamentPageContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  // Cet écran est public : aucune lecture de session ne vient désarmer le
  // piège Mongo, dont le pilote touche à l'horloge en cherchant le tournoi.
  await connection();

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

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function JoinTournamentPage(props: Parameters<typeof JoinTournamentPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg p-8">
          <AccountPanelSkeleton cards={2} label="Chargement de l’inscription" />
        </div>
      }
    >
      <JoinTournamentPageContent {...props} />
    </Suspense>
  );
}
