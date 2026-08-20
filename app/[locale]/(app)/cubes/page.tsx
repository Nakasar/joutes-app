import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getCubesForOwner, getPublicCubes } from "@/lib/db/cubes.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import CubesClient from "./CubesClient.tsx";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Cubes");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

async function CubesPageContent() {

  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [cubes, publicCubes, games] = await Promise.all([
    getCubesForOwner(session.user.id),
    getPublicCubes(),
    readAllGames(),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CubesClient
        initialCubes={cubes}
        // Les cubes publics de l'utilisateur figurent déjà dans « mes cubes ».
        publicCubes={publicCubes.filter((cube) => cube.ownerId !== session.user.id)}
        games={games
          .filter((game): game is typeof game & { slug: string } => Boolean(game.slug))
          .map((game) => ({ id: game.id, name: game.name, slug: game.slug }))}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function CubesPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement des cubes" />
        </div>
      }
    >
      <CubesPageContent />
    </Suspense>
  );
}
