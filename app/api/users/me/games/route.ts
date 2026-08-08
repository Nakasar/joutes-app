import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";
import { getGamesByIds } from "@/lib/db/games";

/**
 * Jeux suivis par l'utilisateur connecté (`User.games`), quel que soit
 * `isPublicProfile` — contrairement à `GET /users/{userTagOrId}`, qui ne
 * révèle cette liste que si le profil est public, même à son propriétaire.
 *
 * `gameIds` porte les identifiants bruts, tels que stockés ; `games` y ajoute
 * de quoi les afficher sans second appel (nom et slug), ce dont le menu de
 * navigation a besoin. Un jeu suivi puis supprimé figure donc dans `gameIds`
 * sans apparaître dans `games`.
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
    const gameIds = user.games ?? [];
    const games = await getGamesByIds(gameIds);

    return NextResponse.json({
      gameIds,
      games: games.map((game) => ({ id: game.id, name: game.name, slug: game.slug ?? null })),
    });
  } catch (error) {
    console.error("Error fetching the user's followed games:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
