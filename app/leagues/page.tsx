import { searchLeagues } from "@/lib/db/leagues";
import { getAllGames } from "@/lib/db/games";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LeaguesClient from "./LeaguesClient";
import {isAdmin} from "@/lib/config/admins";

export const metadata: Metadata = {
  title: "Ligues",
  description: "Découvrez les ligues et tournois de jeux",
  openGraph: {
    url: `https://joutes.app/leagues`,
    siteName: 'Joutes - Participez aux ligues',
    title: 'Ligues - Joutes',
    description: "Découvrez les ligues et tournois de jeux",
  },
};

export default async function LeaguesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Récupérer les ligues publiques
  const [initialLeaguesData, games] = await Promise.all([
    searchLeagues({
      isPublic: true,
      status: ["OPEN", "IN_PROGRESS"],
      page: 1,
      limit: 10,
    }),
    getAllGames(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
              <Trophy className="h-8 w-8 text-primary" />
              Ligues
            </h1>
            <p className="text-xl text-muted-foreground">
              Participez à des ligues et tournois de jeux de société
            </p>
          </div>
          {session?.user && isAdmin(session.user.email) && (
            <Button asChild>
              <Link href="/leagues/new">Créer une ligue</Link>
            </Button>
          )}
        </div>

        <LeaguesClient initialData={initialLeaguesData} games={games} />
      </div>
    </div>
  );
}
