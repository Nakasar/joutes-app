import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCubeAccess, getCubeById } from "@/lib/db/cubes.ts";
import { getCubeStats } from "@/lib/db/cube-stats.ts";
import CubeStatsView from "./CubeStatsView.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function CubeStatsPage({ params }: { params: Promise<{ cubeId: string }> }) {
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
