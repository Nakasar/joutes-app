import { searchLairs } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { Metadata } from "next";
import { MapPin } from "lucide-react";
import CreatePrivateLairButton from "./CreatePrivateLairButton.tsx";
import LairsClient from "./LairsClient.tsx";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Lairs");

  return {
    title: t("page.title"),
    description: t("page.description"),
    keywords: ["lairs", "boutiques de jeux", "magasins de jeux", "local game stores", "événements locaux", "jeux de cartes à collectionner"],
    openGraph: {
      title: `${t("page.title")} - Joutes`,
      description: t("page.description"),
    },
  };
}

export default async function LairsPage({ searchParams }: { searchParams: Promise<{ gameId?: string }> }) {
  const t = await getTranslations("Lairs");

  // Récupérer l'utilisateur connecté pour afficher ses lairs privés
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const { gameId } = await searchParams;

  // Fetch initial data with pagination
  const [initialLairsData, games] = await Promise.all([
    searchLairs({
      gameIds: gameId ? [gameId] : undefined,
      userId: session?.user?.id,
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
              <MapPin className="h-8 w-8 text-primary" />
              {t("page.title")}
            </h1>
            <p className="text-xl text-muted-foreground">
              {t("page.description")}
            </p>
          </div>
          {session?.user && <CreatePrivateLairButton />}
        </div>
        
        <LairsClient initialData={initialLairsData} games={games} initialFilters={{ gameId }} />
      </div>
    </div>
  );
}
