import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSellListForOwner } from "@/lib/db/sell-lists";

/**
 * The caller's own sell list, or null if they haven't listed anything yet.
 * Unlike wishlists, a sell list is created lazily on first `POST
 * /sell-lists/mine/items` — this endpoint never creates one, it only lets a
 * client (e.g. the mobile app) discover the id to fetch/browse it.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const sellList = await getSellListForOwner({ type: "user", id: session.user.id });
    return NextResponse.json({ sellList });
  } catch (error) {
    console.error("Error fetching the user's sell list:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
