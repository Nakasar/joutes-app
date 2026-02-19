import { searchDecks } from "@/lib/db/decks";
import { getAllGames } from "@/lib/db/games";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next";
import { Library } from "lucide-react";
import DecksClient from "./DecksClient";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: 'Mes Decks',
  description: 'Gérez vos decks de jeu',
};

export default async function DecksPage({ searchParams }: { searchParams: Promise<{ gameId?: string }> }) {
  // Récupérer l'utilisateur connecté
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Cette page est réservée aux utilisateurs connectés
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { gameId } = await searchParams;

  // Fetch initial data with pagination
  const [initialDecksData, games] = await Promise.all([
    searchDecks({
      playerId: session.user.id,
      gameId: gameId || undefined,
      page: 1,
      limit: 20,
    }),
    getAllGames(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
              <Library className="h-8 w-8 text-primary" />
              Mes Decks
            </h1>
            <p className="text-xl text-muted-foreground">
              Gérez vos decks de jeu
            </p>
          </div>
        </div>
        
        <DecksClient initialData={initialDecksData} games={games} initialFilters={{ gameId }} />
      </div>
    </div>
  );
}
