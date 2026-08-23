import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth.ts";
import { canAnalyzeDeckListImages } from "@/lib/games/deck-image-access.ts";
import {
  DECK_IMAGE_ALLOWED_CONTENT_TYPES,
  DECK_IMAGE_MAX_SIZE,
  DECK_IMAGE_PATH_PREFIX,
} from "@/lib/games/deck-images.ts";

/**
 * Le jeton d'un dépôt direct depuis le navigateur, pour les photos de listes
 * trop lourdes pour transiter par une action serveur (Vercel plafonne le
 * corps d'une requête bien avant la taille d'une photo de téléphone).
 *
 * `upload()` côté client appelle cette route avant d'écrire quoi que ce soit :
 * sans elle, il reçoit un 404 et échoue sur « Failed to retrieve the client
 * token » — le fichier n'est jamais parti.
 *
 * La session se vérifie en tête, et non dans `onBeforeGenerateToken`, parce
 * que cette route ne fait qu'émettre des jetons : faute de `onUploadCompleted`,
 * aucun rappel non authentifié de Vercel Blob n'y atterrit. En ajouter un
 * demanderait de redescendre ce contrôle dans le rappel de génération.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!canAnalyzeDeckListImages(session?.user.email)) {
    return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Le chemin vient du navigateur : le jeton ne doit ouvrir que le
        // dossier des listes, et rien d'autre du magasin de blobs.
        if (!pathname.startsWith(DECK_IMAGE_PATH_PREFIX) || pathname.includes('..')) {
          throw new Error("Chemin de dépôt refusé");
        }

        return {
          allowedContentTypes: DECK_IMAGE_ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: DECK_IMAGE_MAX_SIZE,
          // Deux photos du même nom ne se marchent pas dessus : sans suffixe,
          // le dépôt suivant échouerait plutôt que d'écraser le précédent.
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur lors de la génération du jeton de dépôt d'une liste de deck", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dépôt refusé" },
      { status: 400 }
    );
  }
}
