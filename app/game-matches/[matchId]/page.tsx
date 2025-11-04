import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGameMatchById } from "@/lib/db/game-matches";
import { getAllGames } from "@/lib/db/games";
import { getAllLairs } from "@/lib/db/lairs";
import { notFound, redirect } from "next/navigation";
import GameMatchDetails from "./GameMatchDetails";

type PageProps = {
  params: Promise<{
    matchId: string;
  }>;
};

export default async function GameMatchDetailPage({ params }: PageProps) {
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
  const isPlayer = match.players.some((p) => p.userId === session.user.id);

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
      <GameMatchDetails
        match={match}
        games={games}
        lairs={lairs}
        currentUserId={session.user.id}
      />
    </div>
  );
}
