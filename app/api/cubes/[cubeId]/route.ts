import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteCube, getCubeAccess, getCubeById, getCubePacks, updateCube } from "@/lib/db/cubes";
import { cubeUpdateSchema } from "@/lib/schemas/cube.schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const access = getCubeAccess(cube, session?.user?.id);
  // Un cube privé se comporte comme inexistant pour un tiers : répondre 403
  // révélerait son existence.
  if (!access.canView) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const packs = await getCubePacks(cubeId);
  return NextResponse.json({ cube, packs, canEdit: access.canEdit });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session.user.id).canEdit) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const validation = cubeUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  // `updateCube` relit le cube après écriture : il rend `null` si le cube a
  // disparu entre le contrôle d'accès et la mise à jour.
  const updated = await updateCube(cubeId, validation.data);
  if (!updated) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session.user.id).canEdit) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  await deleteCube(cubeId);
  return NextResponse.json({ success: true });
}
