import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { serializeGameMatch } from "@/lib/api/game-matches";
import { getGameMatchById } from "@/lib/db/game-matches";

/**
 * Fiche d'une partie. Réservée à ceux qui y étaient : son créateur et ses
 * joueurs, comme la page web.
 *
 * L'appartenance se lit dans `playerIds`, qui ne contient que des comptes —
 * `players` y mêle les invités, dont l'identifiant n'appartient à personne et
 * n'ouvre donc aucun accès.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const user = await authenticateApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { matchId } = await params;
  if (!/^[0-9a-fA-F]{24}$/.test(matchId)) {
    return NextResponse.json({ error: "Partie non trouvée" }, { status: 404 });
  }

  try {
    const match = await getGameMatchById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Partie non trouvée" }, { status: 404 });
    }

    const isCreator = match.createdBy === user.userId;
    const isPlayer = match.playerIds.includes(user.userId);
    if (!isCreator && !isPlayer) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    return NextResponse.json(await serializeGameMatch(match));
  } catch (error) {
    console.error("Erreur lors de la récupération de la partie:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
