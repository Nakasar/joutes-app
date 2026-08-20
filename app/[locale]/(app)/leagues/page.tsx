import { searchLeagues } from "@/lib/db/leagues.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Metadata } from "next";
import { Suspense } from "react";
import { Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { setRequestLocale } from "next-intl/server";
import LeaguesClient from "./LeaguesClient.tsx";
import { ContentListSkeleton } from "@/components/ContentListSkeleton.tsx";
import {isAdmin} from "@/lib/config/admins.ts";

export const metadata: Metadata = {
  title: "Ligues",
  description: "Découvrez les ligues et tournois de jeux de cartes à collectionner et de jeux de plateau près de chez vous.",
  keywords: ["ligues", "tournois", "compétition", "classement", "jeux de cartes à collectionner", "organized play"],
  openGraph: {
    url: `https://joutes.app/leagues`,
    siteName: 'Joutes',
    title: 'Ligues - Joutes',
    description: "Découvrez les ligues et tournois de jeux de cartes à collectionner et de jeux de plateau près de chez vous.",
  },
};

/**
 * Le titre et l'accroche ne dépendent de rien : ils restent dans la coquille.
 * Cette route n'a pas de segment dynamique, donc pas de coquille de repli
 * partagée — ce qui est en dehors des frontières est réellement prérendu.
 */
export default async function LeaguesPage({ params }: { params: Promise<{ locale: string }> }) {
  // Le bouton de création est un `Link` localisé, mais il est sous frontière.
  // Cet appel garde malgré tout la langue fixée pour tout ce qui rend ici.
  const { locale } = await params;
  setRequestLocale(locale);

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
          {/* Pas de silhouette : ce bouton n'est visible que de l'équipe, et
              lui réserver sa place la ferait sauter à tous les autres. */}
          <Suspense fallback={null}>
            <CreateLeagueButton />
          </Suspense>
        </div>

        <Suspense fallback={<ContentListSkeleton />}>
          <LeaguesList />
        </Suspense>
      </div>
    </div>
  );
}

async function CreateLeagueButton() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isAdmin(session.user.email)) return null;

  return (
    <Button asChild>
      <Link href="/leagues/new">Créer une ligue</Link>
    </Button>
  );
}

async function LeaguesList() {
  // Le pilote Mongo touche à l'horloge en cherchant les ligues, ce qu'un
  // prérendu ne sait pas figer. Aucune frontière n'y change rien : c'est de la
  // sync-IO, pas une donnée de requête.
  await connection();

  // Seules les ligues publiques et en cours sont listées : la session ne change
  // rien à ce que cette liste montre.
  const [initialLeaguesData, games] = await Promise.all([
    searchLeagues({
      isPublic: true,
      status: ["OPEN", "IN_PROGRESS"],
      page: 1,
      limit: 10,
    }),
    readAllGames(),
  ]);

  return <LeaguesClient initialData={initialLeaguesData} games={games} />;
}
