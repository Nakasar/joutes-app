import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { getGameMatchById } from "@/lib/db/game-matches.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getAllLairs } from "@/lib/db/lairs.ts";
import { notFound, redirect } from "next/navigation";
import GameMatchDetailsWrapper from "./GameMatchDetailsWrapper.tsx";

type PageProps = {
  params: Promise<{
    matchId: string;
  }>;
};

async function GameMatchDetailPageContent({ params }: PageProps) {
  const resolvedParams = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  // Récupérer la partie
  const match = await getGameMatchById(resolvedParams.matchId);

  if (!match) {
    notFound();
  }

  // Vérifier que l'utilisateur a accès à la partie
  // Seuls le créateur et les joueurs peuvent accéder à la page
  const isCreator = match.createdBy === session.user.id;
  // `playerIds` ne contient que des comptes : `players` y mêle les invités, qui
  // n'ouvrent aucun accès.
  const isPlayer = match.playerIds.includes(session.user.id);

  if (!isCreator && !isPlayer) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="p-6 bg-destructive/10 border border-destructive rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Accès refusé</h2>
          <p className="text-muted-foreground">
            Vous n&apos;avez pas accès à cette partie.
          </p>
        </div>
      </div>
    );
  }

  // Récupérer les données nécessaires
  const [games, lairs] = await Promise.all([
    getAllGames(),
    getAllLairs(),
  ]);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <GameMatchDetailsWrapper
        match={match}
        games={games}
        lairs={lairs}
        currentUserId={session.user.id}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function GameMatchDetailPage(props: Parameters<typeof GameMatchDetailPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <AccountPanelSkeleton cards={2} label="Chargement de la partie" />
        </div>
      }
    >
      <GameMatchDetailPageContent {...props} />
    </Suspense>
  );
}
