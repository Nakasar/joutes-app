import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getCollectionOverview } from "@/lib/db/collection.ts";
import CollectionOverview from "./CollectionOverview.tsx";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Collection");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["collection de cartes", "suivi de collection", "jeux de cartes à collectionner", "master set", "cartes possédées"],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

async function CollectionPageContent() {

  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const overview = await getCollectionOverview({ type: "user", id: session.user.id });

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CollectionOverview initialOverview={overview} valuePath="/api/collection/value" />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function CollectionPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement de la collection" />
        </div>
      }
    >
      <CollectionPageContent />
    </Suspense>
  );
}
