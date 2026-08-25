import { NextResponse } from "next/server";
import { findUserByParam } from "@/lib/api/users";
import { getSellListForOwner } from "@/lib/db/sell-lists";

type Params = Promise<{ userTagOrId: string }>;


/** Liste de vente d'un utilisateur (toujours publique), ou `null` s'il n'a rien mis en vente. */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  try {
    const user = await findUserByParam(userTagOrId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const sellList = await getSellListForOwner({ type: "user", id: user.id });
    return NextResponse.json({ sellList });
  } catch (error) {
    console.error("Error fetching user's sell list:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
