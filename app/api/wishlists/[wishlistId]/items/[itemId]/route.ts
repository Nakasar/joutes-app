import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getWishlistAccess,
  getWishlistById,
  removeWishlistItem,
  updateWishlistItem,
} from "@/lib/db/wishlists";
import { wishlistItemUpdateSchema } from "@/lib/schemas/wishlist.schema";

type Params = Promise<{ wishlistId: string; itemId: string }>;

async function requireEditAccess(wishlistId: string, userId?: string) {
  if (!userId) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return { error: NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 }) };
  }

  const { canEdit } = await getWishlistAccess(wishlist, userId);
  if (!canEdit) {
    return { error: NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 }) };
  }

  return { wishlist };
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId, itemId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const access = await requireEditAccess(wishlistId, session?.user?.id);
  if (access.error) return access.error;

  const body = await request.json();
  const validationResult = wishlistItemUpdateSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  const item = await updateWishlistItem(wishlistId, itemId, validationResult.data);
  if (!item) {
    return NextResponse.json({ error: "Carte introuvable dans la liste de souhaits" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId, itemId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const access = await requireEditAccess(wishlistId, session?.user?.id);
  if (access.error) return access.error;

  const result = await removeWishlistItem(wishlistId, itemId);
  if (!result) {
    return NextResponse.json({ error: "Carte introuvable dans la liste de souhaits" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
