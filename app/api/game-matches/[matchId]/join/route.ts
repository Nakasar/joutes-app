import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGameMatchById, addPlayerToGameMatch } from "@/lib/db/game-matches";
import { getUserById } from "@/lib/db/users";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;

    // Vérifier la session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    // Si l'utilisateur n'est pas connecté, rediriger vers la page de login
    if (!session?.user?.id) {
      const callbackUrl = `/api/game-matches/${matchId}/join`;
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, request.url)
      );
    }

    // Récupérer la partie
    const match = await getGameMatchById(matchId);

    if (!match) {
      return NextResponse.redirect(
        new URL(`/game-matches?error=${encodeURIComponent("Partie non trouvée")}`, request.url)
      );
    }

    // Vérifier si l'utilisateur est déjà dans la partie
    const isAlreadyPlayer = match.players.some((p) => p.userId === session.user.id);

    if (isAlreadyPlayer) {
      return NextResponse.redirect(
        new URL(`/game-matches/${matchId}?message=${encodeURIComponent("Vous êtes déjà dans cette partie")}`, request.url)
      );
    }

    // Récupérer les informations de l'utilisateur
    const user = await getUserById(session.user.id);

    if (!user) {
      return NextResponse.redirect(
        new URL(`/game-matches?error=${encodeURIComponent("Utilisateur non trouvé")}`, request.url)
      );
    }

    // Ajouter le joueur à la partie
    const result = await addPlayerToGameMatch(matchId, {
      userId: user.id,
      username: `${user.displayName}#${user.discriminator}`,
      displayName: user.displayName,
      discriminator: user.discriminator,
    });

    if (!result) {
      return NextResponse.redirect(
        new URL(`/game-matches/${matchId}?error=${encodeURIComponent("Erreur lors de l'ajout à la partie")}`, request.url)
      );
    }

    // Rediriger vers la page de la partie
    return NextResponse.redirect(
      new URL(`/game-matches/${matchId}?message=${encodeURIComponent("Vous avez rejoint la partie avec succès")}`, request.url)
    );
  } catch (error) {
    console.error("Erreur lors de l'ajout du joueur via invitation:", error);
    return NextResponse.redirect(
      new URL(`/game-matches?error=${encodeURIComponent("Erreur serveur")}`, request.url)
    );
  }
}
