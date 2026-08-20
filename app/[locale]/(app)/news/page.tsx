import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getAllTags } from "@/lib/db/news.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { Metadata } from "next";
import { Suspense } from "react";
import { Newspaper, PenSquare } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import NewsListClient from "./NewsListClient.tsx";
import { ContentListSkeleton } from "@/components/ContentListSkeleton.tsx";

export const metadata: Metadata = {
  title: "Actualités",
  description: "Toutes les actualités de la communauté Joutes : annonces, extensions, événements et mises à jour des jeux.",
  keywords: ["actualités", "news", "annonces", "extensions", "communauté", "jeux de cartes à collectionner"],
  openGraph: {
    url: "https://joutes.app/news",
    siteName: "Joutes",
    title: "Actualités - Joutes",
    description: "Toutes les actualités de la communauté Joutes : annonces, extensions, événements et mises à jour des jeux.",
  },
};

/**
 * Le titre et l'accroche ne dépendent de rien : ils restent dans la coquille.
 *
 * Cette route n'a **pas de segment dynamique**, donc pas de coquille de repli
 * partagée : ce qui est en dehors des frontières est réellement prérendu, langue
 * comprise. C'est ce qui distingue cette page des outils de jeu, où la coquille
 * se limite au cadre de l'application.
 */
export default function NewsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
              <Newspaper className="h-8 w-8 text-primary" />
              Actualités
            </h1>
            <p className="text-xl text-muted-foreground">
              Restez informé des dernières nouvelles de la communauté
            </p>
          </div>
          {/* Pas de silhouette : ce bouton ne s'affiche qu'à la rédaction, et
              lui réserver sa place la ferait sauter pour tous les autres. */}
          <Suspense fallback={null}>
            <WriteNewsButton />
          </Suspense>
        </div>

        <Suspense fallback={<ContentListSkeleton />}>
          <NewsList />
        </Suspense>
      </div>
    </div>
  );
}

async function WriteNewsButton() {
  const canWrite = await hasPermission("news:update").catch(() => false);
  if (!canWrite) return null;

  return (
    <Button asChild>
      <Link href="/news/create">
        <PenSquare className="h-4 w-4 mr-2" />
        Rédiger une actualité
      </Link>
    </Button>
  );
}

async function NewsList() {
  const [session, games, tags, canWrite] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    readAllGames(),
    getAllTags(),
    hasPermission("news:update").catch(() => false),
  ]);

  return (
    <NewsListClient
      games={games}
      tags={tags}
      userId={session?.user?.id}
      canWrite={canWrite}
    />
  );
}
