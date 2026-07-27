import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Metadata } from "next/types";
import { getCubeAccess, getCubeById, getCubeOwnerInfo, getCubePacks } from "@/lib/db/cubes";
import CubeDetailClient from "./CubeDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ cubeId: string }> }): Promise<Metadata> {
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

export default async function CubePage({ params }: { params: Promise<{ cubeId: string }> }) {
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

  const [packs, owner] = await Promise.all([
    getCubePacks(cubeId),
    access.canEdit ? Promise.resolve(null) : getCubeOwnerInfo(cube),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CubeDetailClient
        cube={cube}
        packs={packs}
        canEdit={access.canEdit}
        ownerLabel={owner?.label}
        ownerHref={owner?.href}
      />
    </div>
  );
}
