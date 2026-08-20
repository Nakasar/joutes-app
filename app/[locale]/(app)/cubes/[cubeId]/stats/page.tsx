import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCubeAccess, getCubeById } from "@/lib/db/cubes.ts";
import { getCubeStats } from "@/lib/db/cube-stats.ts";
import CubeStatsView from "./CubeStatsView.tsx";

async function CubeStatsPageContent({ params }: { params: Promise<{ cubeId: string }> }) {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube) {
    notFound();
  }

  if (!getCubeAccess(cube, session?.user?.id).canView) {
    notFound();
  }

  const stats = await getCubeStats(cubeId, cube.gameId);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CubeStatsView cube={cube} stats={stats} />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function CubeStatsPage(props: Parameters<typeof CubeStatsPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={6} label="Chargement des statistiques" />
        </div>
      }
    >
      <CubeStatsPageContent {...props} />
    </Suspense>
  );
}
