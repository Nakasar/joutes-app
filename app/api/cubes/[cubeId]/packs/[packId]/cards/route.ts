import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  addCardToCubePack,
  getCubeAccess,
  getCubeById,
  getCubePack,
  removeCardFromCubePack,
  setCubeCardQuantity,
} from "@/lib/db/cubes";
import { cubeCardQuantitySchema, cubeCardSchema } from "@/lib/schemas/cube.schema";

async function editablePack(cubeId: string, packId: string, userId?: string) {
  if (!userId) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, userId).canEdit) {
    return { error: NextResponse.json({ error: "Cube introuvable" }, { status: 404 }) };
  }

  const pack = await getCubePack(cubeId, packId);
  if (!pack) {
    return { error: NextResponse.json({ error: "Paquet introuvable" }, { status: 404 }) };
  }

  return { error: null };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const { error } = await editablePack(cubeId, packId, session?.user?.id);
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  const validation = cubeCardSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const card = await addCardToCubePack(cubeId, packId, validation.data);
  return NextResponse.json(card, { status: 201 });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const { error } = await editablePack(cubeId, packId, session?.user?.id);
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  const validation = cubeCardQuantitySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Données invalides" },
      { status: 400 },
    );
  }

  const { quantity, ...card } = validation.data;
  const cards = await setCubeCardQuantity(cubeId, packId, card, quantity);

  return NextResponse.json({
    // Le paquet complet évite au client de recalculer les exemplaires restants.
    cards: cards.map(({ id, cardId, name, setCode, collectorNumber, image, orientation }) => ({
      id,
      cardId,
      name,
      setCode,
      collectorNumber,
      image,
      orientation,
    })),
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ cubeId: string; packId: string }> }) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const { error } = await editablePack(cubeId, packId, session?.user?.id);
  if (error) {
    return error;
  }

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entryId manquant" }, { status: 400 });
  }

  const removed = await removeCardFromCubePack(cubeId, packId, entryId);
  if (!removed) {
    return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
