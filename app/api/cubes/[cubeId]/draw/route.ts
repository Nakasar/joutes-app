import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCubeAccess, getCubeById } from "@/lib/db/cubes";
import { drawCube } from "@/lib/db/cube-draw";
import { DEFAULT_CUBE_DRAW } from "@/lib/constants/cubes";
import { cubeDrawRequestSchema } from "@/lib/schemas/cube.schema";

export async function POST(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  // Le tirage se joue sans compte : seule la visibilité du cube conditionne l'accès.
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session?.user?.id).canView) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const validation = cubeDrawRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const result = await drawCube(cubeId, cube.gameId, validation.data.players, cube.draw ?? DEFAULT_CUBE_DRAW);
  return NextResponse.json(result);
}
