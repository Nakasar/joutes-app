import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { searchDecks } from "@/lib/db/decks.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { Metadata } from "next";
import { Library } from "lucide-react";
import DecksClient from "./DecksClient.tsx";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: 'Decks',
  description: 'Construisez, gérez et partagez vos decks de jeux de cartes à collectionner. Vérifiez leur légalité et analysez votre courbe de coûts.',
  keywords: ["decks", "deck building", "jeux de cartes à collectionner", "courbe de coûts", "légalité de deck"],
  openGraph: {
    title: 'Decks - Joutes',
    description: 'Construisez, gérez et partagez vos decks de jeux de cartes à collectionner.',
  },
};

async function DecksPageContent({ searchParams }: { searchParams: Promise<{ gameId?: string; favoritesOnly?: string }> }) {
  // Récupérer l'utilisateur connecté
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Cette page est réservée aux utilisateurs connectés
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { gameId, favoritesOnly } = await searchParams;

  // Fetch initial data with pagination
  const [initialDecksData, games] = await Promise.all([
    searchDecks({
      playerId: session.user.id,
      gameId: gameId || undefined,
      page: 1,
      limit: 20,
      scope: "mine",
      viewerId: session.user.id,
      favoritesOnly: favoritesOnly === "true",
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

        <DecksClient
          currentUserId={session.user.id}
          initialData={initialDecksData}
          games={games}
          initialFilters={{ gameId, favoritesOnly: favoritesOnly === "true" }}
        />
      </div>
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function DecksPage(props: Parameters<typeof DecksPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <CollectionSkeleton tiles={8} label="Chargement de vos decks" />
        </div>
      }
    >
      <DecksPageContent {...props} />
    </Suspense>
  );
}
