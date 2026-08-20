import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Metadata } from "next/types";
import { getCubeAccess, getCubeById, getCubeOwnerInfo, getCubePacks } from "@/lib/db/cubes.ts";
import { getCubeAttributeOptions } from "@/lib/db/cube-draw.ts";
import { DEFAULT_CUBE_DRAW } from "@/lib/constants/cubes.ts";
import CubeDetailClient from "./CubeDetailClient.tsx";

export async function generateMetadata({ params }: { params: Promise<{ cubeId: string }> }): Promise<Metadata> {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { cubeId } = await params;
  const cube = await getCubeById(cubeId);
  if (!cube) {
    return {};
  }

  return {
    title: cube.name,
    description: cube.description,
    // Un cube non référencé se partage par son lien mais n'a rien à faire dans
    // un index de moteur de recherche.
    robots: cube.visibility === "public" ? undefined : { index: false, follow: false },
  };
}

async function CubePageContent({ params }: { params: Promise<{ cubeId: string }> }) {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube) {
    notFound();
  }

  const access = getCubeAccess(cube, session?.user?.id);
  if (!access.canView) {
    notFound();
  }

  const [packs, owner, attributeOptions] = await Promise.all([
    getCubePacks(cubeId),
    access.canEdit ? Promise.resolve(null) : getCubeOwnerInfo(cube),
    // Les attributs disponibles ne servent qu'au formulaire de tirage : inutile
    // de les calculer pour un visiteur qui ne peut pas configurer le cube.
    access.canEdit ? getCubeAttributeOptions(cubeId, cube.gameId) : Promise.resolve([]),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CubeDetailClient
        cube={cube}
        packs={packs}
        canEdit={access.canEdit}
        ownerLabel={owner?.label}
        ownerHref={owner?.href}
        ownerBadges={owner?.badges}
        drawConfig={cube.draw ?? DEFAULT_CUBE_DRAW}
        attributeOptions={attributeOptions}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function CubePage(props: Parameters<typeof CubePageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={8} label="Chargement du cube" />
        </div>
      }
    >
      <CubePageContent {...props} />
    </Suspense>
  );
}
