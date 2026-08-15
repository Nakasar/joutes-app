import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/db/permissions";
import { getGameById } from "@/lib/db/games";
import { importNewsFromUrl, type NewsImportFailure } from "@/lib/news/import";

/**
 * Construit un brouillon d'actualité à partir d'un article publié ailleurs.
 *
 * **Rien n'est enregistré ici** : la réponse alimente le formulaire
 * d'actualité, où l'auteur relit avant de publier. Seules les images sont
 * réellement écrites, sur le stockage de blobs, pour que le brouillon ne
 * dépende plus du site d'origine.
 *
 * Le droit demandé est `news:update`, celui-là même qui permet de rédiger et
 * de téléverser une bannière : un import ne fait rien qu'un rédacteur ne
 * puisse déjà faire à la main, et n'appelle aucun service facturé — d'où
 * l'absence de droit dédié, contrairement à l'import d'un quizz
 * (`quizzes:ai-import`), qui passe, lui, par un modèle.
 */

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/** Recopier les images d'un long article prend du temps ; la route en a le droit. */
export const maxDuration = 120;

const MESSAGE_BY_FAILURE: Record<NewsImportFailure, { message: string; status: number }> = {
  "invalid-url": { message: "L'adresse de l'article est invalide", status: 400 },
  "unsupported-protocol": { message: "Seules les adresses http(s) peuvent être importées", status: 400 },
  "private-address": { message: "Cette adresse ne désigne pas un site public", status: 400 },
  unreachable: { message: "Le site n'a pas répondu", status: 502 },
  "http-error": { message: "Le site a refusé de servir cette page", status: 502 },
  "too-large": { message: "La page est trop volumineuse pour être importée", status: 413 },
  "not-html": { message: "Cette adresse ne renvoie pas une page web", status: 415 },
  "no-article": { message: "Aucun article n'a pu être tiré de cette page", status: 422 },
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (!(await hasPermission("news:update"))) {
    return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { url, gameId } = (body ?? {}) as { url?: unknown; gameId?: unknown };

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "L'adresse de l'article est requise" }, { status: 400 });
  }
  if (gameId !== undefined && gameId !== "" && (typeof gameId !== "string" || !objectIdPattern.test(gameId))) {
    return NextResponse.json({ error: "Paramètre gameId invalide" }, { status: 400 });
  }

  const resolvedGameId = typeof gameId === "string" && gameId ? gameId : undefined;
  if (resolvedGameId && !(await getGameById(resolvedGameId))) {
    return NextResponse.json({ error: "Jeu non trouvé" }, { status: 404 });
  }

  let result;
  try {
    result = await importNewsFromUrl(url, { gameId: resolvedGameId });
  } catch (error) {
    console.error("Erreur lors de l'import de l'actualité:", error);
    return NextResponse.json({ error: "L'import de l'article a échoué" }, { status: 500 });
  }

  if ("failure" in result) {
    const { message, status } = MESSAGE_BY_FAILURE[result.failure];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(result.draft);
}
