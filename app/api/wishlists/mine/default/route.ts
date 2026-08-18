import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getOrCreateDefaultWishlist } from "@/lib/db/wishlists";
import { wishlistErrorResponse } from "@/lib/api/wishlist-errors";
import { DEFAULT_WISHLIST_NAME } from "@/lib/wishlists/shortcut";

/**
 * Ma liste de souhaits par défaut, créée si je n'en ai aucune.
 *
 * Le premier ajout rapide d'un compte tout neuf commence ici. `POST` et non
 * `GET` parce que l'appel peut écrire — et il n'écrit que dans ce cas-là :
 * appelé par quelqu'un qui a déjà une liste, il se contente de la rendre.
 *
 * Le nom vient du serveur, pas du client : une liste créée d'office ne doit pas
 * pouvoir être nommée par un appel forgé.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const wishlist = await getOrCreateDefaultWishlist(
      { type: "user", id: session.user.id },
      DEFAULT_WISHLIST_NAME
    );

    if (!wishlist) {
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }

    return NextResponse.json({ wishlist });
  } catch (error) {
    const known = wishlistErrorResponse(error);
    if (known) return known;

    console.error("Error resolving the default wishlist:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
