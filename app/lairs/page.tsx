import { searchLairs } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next";
import { MapPin } from "lucide-react";
import CreatePrivateLairButton from "./CreatePrivateLairButton";
import LairsClient from "./LairsClient";

export const metadata: Metadata = {
  title: 'Lieux de jeu',
  description: 'Découvrez tous les lieux de jeu et leurs événements à venir',
};

export default async function LairsPage({ searchParams }: { searchParams: Promise<{ gameId?: string }> }) {
  // Récupérer l'utilisateur connecté pour afficher ses lairs privés
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const { gameId } = await searchParams;

  console.log(gameId);

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
              Lieux de jeu
            </h1>
            <p className="text-xl text-muted-foreground">
              Découvrez tous les lieux de jeu et leurs événements à venir
            </p>
          </div>
          {session?.user && <CreatePrivateLairButton />}
        </div>
        
        <LairsClient initialData={initialLairsData} games={games} initialFilters={{ gameId }} />
      </div>
    </div>
  );
}
