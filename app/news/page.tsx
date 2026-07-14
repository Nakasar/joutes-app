import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAllGames } from "@/lib/db/games";
import { getAllTags } from "@/lib/db/news";
import { hasPermission } from "@/lib/db/permissions";
import { Metadata } from "next";
import { Newspaper, PenSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import NewsListClient from "./NewsListClient";

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

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const [session, games, tags, canWrite] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getAllGames(),
    getAllTags(),
    hasPermission("news:update").catch(() => false),
  ]);

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
          {canWrite && (
            <Button asChild>
              <Link href="/news/create">
                <PenSquare className="h-4 w-4 mr-2" />
                Rédiger une actualité
              </Link>
            </Button>
          )}
        </div>

        <NewsListClient
          games={games}
          tags={tags}
          userId={session?.user?.id}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
