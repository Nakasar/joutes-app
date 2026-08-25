import { NextResponse } from "next/server";
import { listPublicContentsByAuthor } from "@/lib/db/user-contents";
import { findUserByParam } from "@/lib/api/users";

type Params = Promise<{ userTagOrId: string }>;

/**
 * Ce qu'un joueur publie : articles, vidéos, replays.
 *
 * Les brouillons (`visibility: "private"`) n'en sont jamais : la lecture les
 * écarte en base, pas à l'affichage. Un profil privé ne rend rien, comme ses
 * succès et ses jeux suivis.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  try {
    const user = await findUserByParam(userTagOrId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    if (!user.isPublicProfile) {
      return NextResponse.json({ contents: [] });
    }

    return NextResponse.json({ contents: await listPublicContentsByAuthor(user.id) });
  } catch (error) {
    console.error("Error fetching user contents:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
