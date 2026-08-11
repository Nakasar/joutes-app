import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";
import { getGameSummariesByIds } from "@/lib/db/games";

/**
 * Jeux suivis par l'utilisateur connecté (`User.games`), quel que soit
 * `isPublicProfile` — contrairement à `GET /users/{userTagOrId}`, qui ne
 * révèle cette liste que si le profil est public, même à son propriétaire.
 *
 * `gameIds` porte les identifiants bruts, tels que stockés ; `games` y ajoute
 * de quoi les afficher sans second appel (nom, slug, visuel et fanions des
 * outils), ce dont le menu de navigation a besoin. Un jeu suivi puis supprimé
 * figure donc dans `gameIds` sans apparaître dans `games`.
 *
 * `favoriteGameIds` désigne les jeux mis en avant parmi les suivis : ce sont
 * eux que le menu propose quand il y en a.
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
    const games = await getGameSummariesByIds(gameIds);
    // Un favori dont le jeu n'est plus suivi n'est pas rendu : il ne
    // désignerait rien dans `games`, et le menu l'écarterait de toute façon.
    const favoriteGameIds = (user.favoriteGames ?? []).filter((id) => gameIds.includes(id));

    return NextResponse.json({ gameIds, games, favoriteGameIds });
  } catch (error) {
    console.error("Error fetching the user's followed games:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
