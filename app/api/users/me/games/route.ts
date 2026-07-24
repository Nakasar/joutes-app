import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";

/**
 * Jeux suivis par l'utilisateur connecté (`User.games`), quel que soit
 * `isPublicProfile` — contrairement à `GET /users/{userTagOrId}`, qui ne
 * révèle cette liste que si le profil est public, même à son propriétaire.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }
    return NextResponse.json({ gameIds: user.games ?? [] });
  } catch (error) {
    console.error("Error fetching the user's followed games:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
