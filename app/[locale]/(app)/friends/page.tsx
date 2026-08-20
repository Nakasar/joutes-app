import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import FriendsPageClient from "@/components/friends/FriendsPageClient.tsx";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mes amis",
  description: "Gérez votre liste d'amis sur Joutes : envoyez des demandes d'ami et retrouvez vos amis facilement.",
  keywords: ["amis", "liste d'amis", "communauté", "jeux de cartes à collectionner"],
  openGraph: {
    url: `https://joutes.app/friends`,
    siteName: 'Joutes',
    title: 'Mes amis - Joutes',
    description: "Envoyez des demandes d'ami et retrouvez vos amis facilement.",
  },
};

async function FriendsPageContent() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Mes amis</h1>
          <p className="text-xl text-muted-foreground">
            Gérez vos amis et vos demandes d&apos;ami.
          </p>
        </div>
        <FriendsPageClient />
      </div>
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function FriendsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <CollectionSkeleton tiles={8} label="Chargement de vos amis" />
        </div>
      }
    >
      <FriendsPageContent />
    </Suspense>
  );
}
