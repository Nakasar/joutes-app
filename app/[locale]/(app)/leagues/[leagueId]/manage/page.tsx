import {getLeagueById, getLeagueRanking, isLeagueOrganizer} from "@/lib/db/leagues.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getAllLairs } from "@/lib/db/lairs.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft } from "lucide-react";
import LeagueManageClient from "./LeagueManageClient.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await getLeagueById(leagueId);

  if (!league) {
    return {
      title: "Ligue non trouvée",
    };
  }

  return {
    title: `Gérer ${league.name}`,
    description: "Gérer votre ligue",
  };
}

export default async function LeagueManagePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const league = await getLeagueById(leagueId);

  if (!league) {
    notFound();
  }

  const canManage = await isLeagueOrganizer(leagueId, session.user.id);

  if (!canManage) {
    redirect(`/leagues/${leagueId}`);
  }

  // Récupérer les détails des participants
  const participantsWithUsers = await getLeagueRanking(league.id);
  const leagueGames = league.games;
  // Récupérer tous les jeux et lairs disponibles pour l'édition
  const [allGames, allLairs] = await Promise.all([
    getAllGames(),
    getAllLairs(session.user.id),
  ]);

  const ownedLairs = allLairs;


  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/leagues/${leagueId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Gérer {league.name}</h1>
        </div>

        <LeagueManageClient
          league={league}
          participantsWithUsers={participantsWithUsers}
          leagueGames={leagueGames}
          allGames={allGames}
          allLairs={ownedLairs}
        />
      </div>
    </div>
  );
}
