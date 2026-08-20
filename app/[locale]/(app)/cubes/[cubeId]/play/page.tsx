import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCubeAccess, getCubeById } from "@/lib/db/cubes.ts";
import { DEFAULT_CUBE_DRAW } from "@/lib/constants/cubes.ts";
import CubePlayClient from "./CubePlayClient.tsx";

async function CubePlayPageContent({ params }: { params: Promise<{ cubeId: string }> }) {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { cubeId } = await params;
  // Jouer ne demande pas de compte : seule la visibilité du cube décide.
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube) {
    notFound();
  }

  if (!getCubeAccess(cube, session?.user?.id).canView) {
    notFound();
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CubePlayClient
        cube={cube}
        config={cube.draw ?? DEFAULT_CUBE_DRAW}
        usingDefaults={!cube.draw}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function CubePlayPage(props: Parameters<typeof CubePlayPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={4} label="Chargement du tirage" />
        </div>
      }
    >
      <CubePlayPageContent {...props} />
    </Suspense>
  );
}
