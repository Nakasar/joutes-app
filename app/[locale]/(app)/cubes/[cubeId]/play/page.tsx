import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCubeAccess, getCubeById } from "@/lib/db/cubes.ts";
import { DEFAULT_CUBE_DRAW } from "@/lib/constants/cubes.ts";
import CubePlayClient from "./CubePlayClient.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function CubePlayPage({ params }: { params: Promise<{ cubeId: string }> }) {
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
