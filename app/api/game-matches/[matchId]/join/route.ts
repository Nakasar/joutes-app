import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { serializeGameMatch } from "@/lib/api/game-matches";
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
    // `playerIds` plutôt que `players`, qui mêle désormais les invités : on ne
    // rejoint une partie qu'avec un compte.
    const isAlreadyPlayer = match.playerIds.includes(session.user.id);

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
    const result = await addPlayerToGameMatch(matchId, user.id);

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

/**
 * Le même geste, en JSON.
 *
 * Le `GET` ci-dessus est fait pour un navigateur : il répond en redirections,
 * message en français dans la query string. Un client qui scanne le QR code
 * sans navigateur — l'application mobile — n'a que faire d'une redirection vers
 * une page HTML ; il lui faut savoir s'il a rejoint, et quelle partie.
 *
 * Rejoindre deux fois n'est pas une erreur : le QR code d'une partie reste
 * affiché, on le scanne parfois deux fois. La réponse le dit (`joined: false`)
 * plutôt que d'échouer, et rend la partie dans les deux cas.
 */
export async function POST(
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

    // `playerIds` plutôt que `players`, qui mêle les invités : on ne rejoint
    // une partie qu'avec un compte.
    if (match.playerIds.includes(user.userId)) {
      return NextResponse.json({ joined: false, match: await serializeGameMatch(match) });
    }

    const account = await getUserById(user.userId);
    if (!account) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    const added = await addPlayerToGameMatch(matchId, account.id);
    if (!added) {
      return NextResponse.json(
        { error: "Erreur lors de l'ajout à la partie" },
        { status: 500 }
      );
    }

    // Relecture plutôt que retouche de l'objet en mémoire : c'est la partie
    // telle qu'elle est enregistrée que le client doit afficher, joueur compris.
    const joinedMatch = (await getGameMatchById(matchId)) ?? match;
    return NextResponse.json({ joined: true, match: await serializeGameMatch(joinedMatch) });
  } catch (error) {
    console.error("Erreur lors de l'ajout du joueur via invitation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
