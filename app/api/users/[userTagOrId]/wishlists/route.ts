import { NextResponse } from "next/server";
import { getUserByTagOrId } from "@/lib/db/users";
import { getPublicWishlistsForOwner } from "@/lib/db/wishlists";

type Params = Promise<{ userTagOrId: string }>;

function resolveUserTagOrId(raw: string): string {
  if (raw.includes("#") || /^[0-9a-fA-F]{24}$/.test(raw)) {
    return raw;
  }
  const discriminator = raw.slice(-4);
  const displayName = raw.slice(0, -4);
  return `${displayName}#${discriminator}`;
}

/** Listes de souhaits publiques d'un utilisateur (`visibility: "public"` uniquement). */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  const user = await getUserByTagOrId(resolveUserTagOrId(decodeURIComponent(userTagOrId)));
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const wishlists = await getPublicWishlistsForOwner({ type: "user", id: user.id });
  return NextResponse.json({ wishlists });
}
