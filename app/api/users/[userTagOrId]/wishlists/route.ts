import { NextResponse } from "next/server";
import { findUserByParam } from "@/lib/api/users";
import { getPublicWishlistsForOwner } from "@/lib/db/wishlists";

type Params = Promise<{ userTagOrId: string }>;


/** Listes de souhaits publiques d'un utilisateur (`visibility: "public"` uniquement). */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  try {
    const user = await findUserByParam(userTagOrId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const wishlists = await getPublicWishlistsForOwner({ type: "user", id: user.id });
    return NextResponse.json({ wishlists });
  } catch (error) {
    console.error("Error fetching user's public wishlists:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
