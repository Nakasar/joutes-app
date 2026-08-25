import { NextResponse } from "next/server";
import { getAchievementsForUser } from "@/lib/db/achievements";
import { unlockedMostRecentFirst } from "@/lib/achievements/unlocked";
import { findUserByParam } from "@/lib/api/users";

type Params = Promise<{ userTagOrId: string }>;

/**
 * Tous les succès d'un joueur : ceux qu'il a décrochés, et ceux qui restent à
 * atteindre.
 *
 * Une route à part, plutôt qu'un champ de plus sur le profil : le catalogue
 * entier peut faire des centaines d'entrées, et l'en-tête d'un profil n'a pas à
 * le payer à chaque ouverture. Le profil ne porte donc que les succès décrochés.
 *
 * Un profil privé ne rend rien — c'est déjà la règle que `GET /users/{tag}`
 * applique à ses succès, et une seconde route ne doit pas être le chemin
 * détourné qui la contredit.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  try {
    const user = await findUserByParam(userTagOrId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    if (!user.isPublicProfile) {
      return NextResponse.json({ achievements: [], unlocked: 0, total: 0, points: 0 });
    }

    const all = await getAchievementsForUser(user.id);
    const unlocked = unlockedMostRecentFirst(all);

    return NextResponse.json({
      achievements: all,
      unlocked: unlocked.length,
      total: all.length,
      points: unlocked.reduce((sum, achievement) => sum + (achievement.points ?? 0), 0),
    });
  } catch (error) {
    console.error("Error fetching user achievements:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
