import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createCubePack, getCubeAccess, getCubeById, getCubePacks } from "@/lib/db/cubes";
import { cubePackSchema } from "@/lib/schemas/cube.schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session?.user?.id).canView) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  return NextResponse.json({ packs: await getCubePacks(cubeId) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session.user.id).canEdit) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const validation = cubePackSchema.safeParse(body ?? {});
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const pack = await createCubePack(cubeId, validation.data);
  return NextResponse.json(pack, { status: 201 });
}
