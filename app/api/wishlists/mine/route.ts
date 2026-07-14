import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getWishlistsForOwner } from "@/lib/db/wishlists";
import { getPlayGroupsForUser } from "@/lib/db/play-groups";

/**
 * Every wishlist the current user can add cards to: their own personal
 * wishlists, plus the wishlists of every play-group they're a member of.
 * Used by the "Add to wishlist" picker, which needs a single combined list
 * regardless of which page (card detail, collection browser) triggers it.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const [personal, playGroups] = await Promise.all([
      getWishlistsForOwner({ type: "user", id: session.user.id }),
      getPlayGroupsForUser(session.user.id),
    ]);

    const groups = await Promise.all(
      playGroups.map(async (group) => ({
        group: { id: group.id, name: group.name },
        wishlists: await getWishlistsForOwner({ type: "playGroup", id: group.id }),
      }))
    );

    return NextResponse.json({ personal, groups: groups.filter((g) => g.wishlists.length > 0) });
  } catch (error) {
    console.error("Error fetching the user's wishlists:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
