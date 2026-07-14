import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  deleteWishlist,
  getWishlistAccess,
  getWishlistById,
  updateWishlist,
} from "@/lib/db/wishlists";
import { wishlistIdSchema, wishlistUpdateSchema } from "@/lib/schemas/wishlist.schema";

type Params = Promise<{ wishlistId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canView, canEdit } = await getWishlistAccess(wishlist, session?.user?.id);
  if (!canView) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  return NextResponse.json({ wishlist, canEdit });
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const idValidation = wishlistIdSchema.safeParse(wishlistId);
  if (!idValidation.success) {
    return NextResponse.json({ error: "ID de liste de souhaits invalide" }, { status: 400 });
  }

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canEdit } = await getWishlistAccess(wishlist, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const validationResult = wishlistUpdateSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.issues[0]?.message || "Données invalides" },
      { status: 400 }
    );
  }

  try {
    const updated = await updateWishlist(
      wishlistId,
      { type: wishlist.ownerType, id: wishlist.ownerId },
      validationResult.data
    );
    if (!updated) {
      return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating wishlist:", error);
    if (error instanceof Error && error.message.includes("existe déjà")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const idValidation = wishlistIdSchema.safeParse(wishlistId);
  if (!idValidation.success) {
    return NextResponse.json({ error: "ID de liste de souhaits invalide" }, { status: 400 });
  }

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canEdit } = await getWishlistAccess(wishlist, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const result = await deleteWishlist(wishlistId, { type: wishlist.ownerType, id: wishlist.ownerId });
  if (!result) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
