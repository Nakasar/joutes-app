import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getGameMatchesByUser } from "@/lib/db/game-matches";
import { getAllGames } from "@/lib/db/games";
import { getAllLairs } from "@/lib/db/lairs";
import GameMatchList from "./GameMatchList";
import GameMatchFilters from "./GameMatchFilters";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import GameMatchesClient from "./GameMatchesClient";

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

      <GameMatchesClient matches={matches} games={games} lairs={lairs} />
    </div>
  );
}
