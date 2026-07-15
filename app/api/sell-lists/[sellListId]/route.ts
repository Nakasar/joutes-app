import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  deleteSellList,
  getSellListAccess,
  getSellListById,
  updateSellList,
} from "@/lib/db/sell-lists";
import { sellListIdSchema, sellListUpdateSchema } from "@/lib/schemas/sell-list.schema";

type Params = Promise<{ sellListId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { sellListId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const { canEdit } = await getSellListAccess(sellList, session?.user?.id);
  return NextResponse.json({ sellList, canEdit });
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { sellListId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const idValidation = sellListIdSchema.safeParse(sellListId);
  if (!idValidation.success) {
    return NextResponse.json({ error: "ID de liste de vente invalide" }, { status: 400 });
  }

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const { canEdit } = await getSellListAccess(sellList, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const validationResult = sellListUpdateSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  const updated = await updateSellList(
    sellListId,
    { type: sellList.ownerType, id: sellList.ownerId },
    validationResult.data
  );
  if (!updated) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { sellListId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const idValidation = sellListIdSchema.safeParse(sellListId);
  if (!idValidation.success) {
    return NextResponse.json({ error: "ID de liste de vente invalide" }, { status: 400 });
  }

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const { canEdit } = await getSellListAccess(sellList, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  const result = await deleteSellList(sellListId, { type: sellList.ownerType, id: sellList.ownerId });
  if (!result) {
    return NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
