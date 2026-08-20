import {getLeagueById, getLeagueRanking, isLeagueOrganizer} from "@/lib/db/leagues.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getAllLairs } from "@/lib/db/lairs.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Metadata } from "next";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft } from "lucide-react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import LeagueManageClient from "./LeagueManageClient.tsx";

type Props = { params: Promise<{ leagueId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId } = await params;

  // Même piège Mongo que dans le corps, à désarmer une seconde fois : les
  // métadonnées s'exécutent hors de la frontière de la page.
  await connection();

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

/**
 * Une seule frontière, en-tête compris.
 *
 * Le titre nomme la ligue, et la porte — il faut être de son organisation —
 * doit répondre avant qu'on l'affiche. Découper l'en-tête pour faire arriver le
 * bouton de retour plus tôt ne vaut pas de le séparer de son titre.
 */
export default function LeagueManagePage({ params }: Props) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Suspense fallback={<LeagueManageSkeleton />}>
        <LeagueManage params={params} />
      </Suspense>
    </div>
  );
}

function LeagueManageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex animate-pulse items-center gap-4">
        <div className="h-9 w-9 rounded-md bg-muted" />
        <div className="h-9 w-72 max-w-full rounded bg-muted" />
      </div>
      <EditorFormSkeleton fields={4} />
    </div>
  );
}

async function LeagueManage({ params }: Props) {
  const { leagueId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant la ligue, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

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

  const participantsWithUsers = await getLeagueRanking(league.id);
  const [allGames, allLairs] = await Promise.all([
    readAllGames(),
    getAllLairs(session.user.id),
  ]);

  return (
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
        leagueGames={league.games}
        allGames={allGames}
        allLairs={allLairs}
      />
    </div>
  );
}
