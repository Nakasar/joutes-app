import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getWishlistAccess, getWishlistById, getWishlistCardnexusOrder } from "@/lib/db/wishlists";

type Params = Promise<{ wishlistId: string }>;

/**
 * Le lien pour commander la liste entière sur CardNexus, et ce qu'il couvre
 * (cf. `lib/wishlists/cardnexus-order.ts`). La page le calcule au premier
 * rendu ; l'écran le redemande ici à chaque souhait ajouté, retiré ou changé
 * de quantité, pour que le panier suive la liste.
 *
 * Même porte que la lecture des souhaits : qui peut voir la liste peut la
 * commander, et une liste privée reste introuvable aux autres.
 */
export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { wishlistId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const wishlist = await getWishlistById(wishlistId);
  if (!wishlist) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  const { canView } = await getWishlistAccess(wishlist, session?.user?.id);
  if (!canView) {
    return NextResponse.json({ error: "Liste de souhaits introuvable" }, { status: 404 });
  }

  try {
    return NextResponse.json(await getWishlistCardnexusOrder(wishlistId));
  } catch (error) {
    console.error("Error building the CardNexus order for a wishlist:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
