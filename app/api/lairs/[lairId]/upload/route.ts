import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { checkAdminOrOwner } from "@/lib/middleware/admin";
import { STILL_IMAGE_KINDS, readImageUpload } from "@/lib/media/image-upload";

/**
 * Le dépôt d'images d'un lieu — logo, bannière, visuels d'annonces, galerie.
 *
 * Une route à part de `/api/upload`, qui n'ouvre qu'aux administrateurs de
 * Joutes : ici c'est l'équipe du lieu qui dépose, et le droit se vérifie donc
 * **sur ce lieu**. Sans ça, personnaliser sa vitrine demanderait un
 * administrateur pour chaque image.
 */


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lairId: string }> }
): Promise<NextResponse> {
  try {
    const { lairId } = await params;

    if (!(await checkAdminOrOwner(lairId))) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const formData = await request.formData();
    const upload = await readImageUpload(formData, { kinds: STILL_IMAGE_KINDS, maxMegabytes: 5 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

    // Le nom du fichier vient du poste du déposant : réduit à son dernier
    // segment, il ne peut pas remonter hors du préfixe du lieu.
    const name = file.name.split(/[\\/]/).pop() || "image";

    // `addRandomSuffix` vaut `false` par défaut sur cette version, et `put`
    // **jette** sur un chemin déjà pris : sans lui, redéposer un `logo.png`
    // corrigé — ou deux photos sorties du même appareil — finirait en 500.
    const blob = await put(`lairs/${lairId}/${name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error("Erreur lors de l'upload d'une image de lieu:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
