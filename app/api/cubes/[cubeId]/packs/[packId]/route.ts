import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  deleteCubePack,
  getCubeAccess,
  getCubeById,
  getCubePack,
  getCubePackCards,
  updateCubePack,
} from "@/lib/db/cubes";
import { cubePackUpdateSchema } from "@/lib/schemas/cube.schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session?.user?.id).canView) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const pack = await getCubePack(cubeId, packId);
  if (!pack) {
    return NextResponse.json({ error: "Paquet introuvable" }, { status: 404 });
  }

  return NextResponse.json({ pack, cards: await getCubePackCards(packId) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session.user.id).canEdit) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const validation = cubePackUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const pack = await updateCubePack(cubeId, packId, validation.data);
  if (!pack) {
    return NextResponse.json({ error: "Paquet introuvable" }, { status: 404 });
  }

  return NextResponse.json(pack);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session.user.id).canEdit) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  await deleteCubePack(cubeId, packId);
  return NextResponse.json({ success: true });
}
