import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getSellListAccess,
  getSellListById,
  removeSellListItem,
  updateSellListItem,
} from "@/lib/db/sell-lists";
import { sellListItemUpdateSchema } from "@/lib/schemas/sell-list.schema";

type Params = Promise<{ sellListId: string; itemId: string }>;

async function requireEditAccess(sellListId: string, userId?: string) {
  if (!userId) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const sellList = await getSellListById(sellListId);
  if (!sellList) {
    return { error: NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 }) };
  }

  const { canEdit } = await getSellListAccess(sellList, userId);
  if (!canEdit) {
    return { error: NextResponse.json({ error: "Liste de vente introuvable" }, { status: 404 }) };
  }

  return { sellList };
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { sellListId, itemId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const access = await requireEditAccess(sellListId, session?.user?.id);
  if (access.error) return access.error;

  const body = await request.json();
  const validationResult = sellListItemUpdateSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  const item = await updateSellListItem(sellListId, itemId, validationResult.data);
  if (!item) {
    return NextResponse.json({ error: "Carte introuvable dans la liste de vente" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { sellListId, itemId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const access = await requireEditAccess(sellListId, session?.user?.id);
  if (access.error) return access.error;

  const result = await removeSellListItem(sellListId, itemId);
  if (!result) {
    return NextResponse.json({ error: "Carte introuvable dans la liste de vente" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
