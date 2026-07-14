import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getGameMatchesByUser } from "@/lib/db/game-matches";
import { getAllGames } from "@/lib/db/games";
import { getAllLairs } from "@/lib/db/lairs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import GameMatchesClient from "./GameMatchesClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Historique des parties",
  description: "Consultez et enregistrez l'historique de vos parties de jeux de cartes à collectionner : résultats, adversaires et statistiques.",
  keywords: ["historique des parties", "suivi de matchs", "jeux de cartes à collectionner", "statistiques de jeu", "résultats"],
  openGraph: {
    url: `https://joutes.app/game-matches`,
    siteName: 'Joutes',
    title: 'Historique des parties - Joutes',
    description: "Consultez et enregistrez l'historique de vos parties : résultats, adversaires et statistiques.",
  },
};

export default async function GameMatchesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [matches, games, lairs] = await Promise.all([
    getGameMatchesByUser(session.user.id),
    getAllGames(),
    getAllLairs(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Historique des parties</h1>
          <p className="text-muted-foreground">
            Consultez toutes vos parties enregistrées
          </p>
        </div>
        <Button asChild>
          <Link href="/game-matches/new">
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle partie
          </Link>
        </Button>
      </div>

      <GameMatchesClient matches={matches} games={games} lairs={lairs} currentUserId={session.user.id} />
    </div>
  );
}
