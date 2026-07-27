import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createCube, getCubesForOwner } from "@/lib/db/cubes";
import { getGameBySlugOrId } from "@/lib/db/games";
import { cubeSchema } from "@/lib/schemas/cube.schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cubes = await getCubesForOwner(session.user.id);
  return NextResponse.json({ cubes });
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = cubeSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const game = await getGameBySlugOrId(validation.data.gameSlug);
  if (!game) {
    return NextResponse.json({ error: "Jeu introuvable" }, { status: 404 });
  }

  const cube = await createCube(
    session.user.id,
    { id: game.id, name: game.name, slug: game.slug },
    validation.data,
  );

  return NextResponse.json(cube, { status: 201 });
}
