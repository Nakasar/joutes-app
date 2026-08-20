import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getWishlistsForOwner } from "@/lib/db/wishlists.ts";
import WishlistsClient from "./WishlistsClient.tsx";
import { ownerHasAdvancedCollection } from "@/lib/db/collection-access.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wishlists");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["wishlist", "liste de souhaits", "cartes recherchées", "échange de cartes", "jeux de cartes à collectionner"],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

async function WishlistsPageContent() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const owner = { type: "user", id: session.user.id } as const;
  const [wishlists, advanced] = await Promise.all([
    getWishlistsForOwner(owner),
    ownerHasAdvancedCollection(owner),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <WishlistsClient initialWishlists={wishlists} apiBasePath="/api/wishlists" advanced={advanced} />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function WishlistsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement de vos listes d’envies" />
        </div>
      }
    >
      <WishlistsPageContent />
    </Suspense>
  );
}
