import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { readAchievementsLeaderboard } from "@/lib/users/registry";

/**
 * Le classement des succès, et le rang de l'appelant.
 *
 * **Un seul classement, un seul filtre** : les profils privés en sont écartés —
 * y figurer serait apparaître dans un registre qu'on a choisi de quitter — et
 * le rang rendu est l'index dans *ce* classement-là. Les calculer séparément
 * annoncerait un rang qui ne correspond à aucune place visible.
 *
 * Seuls les trois premiers sont hydratés : c'est un podium, pas un annuaire.
 * `rank` est `null` sans session, ou pour un compte qui n'y figure pas.
 */
export async function GET(request: Request) {
  try {
    const viewer = await authenticateApiRequest(request);

    return NextResponse.json(await readAchievementsLeaderboard(viewer?.userId ?? null));
  } catch (error) {
    console.error("Error reading the achievements leaderboard:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
