import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getWishlistAccess, getWishlistById, setDefaultWishlist } from "@/lib/db/wishlists";

type Params = Promise<{ wishlistId: string }>;

/**
 * Désigne cette liste comme liste par défaut de son propriétaire.
 *
 * Sa propre route, et non un champ de `PATCH /api/wishlists/[id]` : changer de
 * liste par défaut reste permis même quand la liste visée est **en lecture
 * seule**, alors que `PATCH` est justement ce que la lecture seule interdit.
 * Les mêler aurait obligé à trouer le garde.
 *
 * Ce n'est pas une échappatoire : désigner une autre liste par défaut ne donne
 * aucune capacité de plus, cela déplace seulement celle dont on se sert.
 */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canEdit } = await getWishlistAccess(wishlist, session.user.id);
  if (!canEdit) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  try {
    const owner = { type: wishlist.ownerType, id: wishlist.ownerId } as const;
    const updated = await setDefaultWishlist(wishlistId, owner);

    if (!updated) {
      return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error setting the default wishlist:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
