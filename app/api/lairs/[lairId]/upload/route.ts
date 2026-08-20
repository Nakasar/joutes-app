import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { checkAdminOrOwner } from "@/lib/middleware/admin";

/**
 * Le dépôt d'images d'un lieu — logo, bannière, visuels d'annonces, galerie.
 *
 * Une route à part de `/api/upload`, qui n'ouvre qu'aux administrateurs de
 * Joutes : ici c'est l'équipe du lieu qui dépose, et le droit se vérifie donc
 * **sur ce lieu**. Sans ça, personnaliser sa vitrine demanderait un
 * administrateur pour chaque image.
 */

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

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
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé. Utilisez JPG, PNG ou WebP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Le fichier est trop volumineux (max 5 Mo)" },
        { status: 400 }
      );
    }

    // Le nom du fichier vient du poste du déposant : préfixé par le lieu et
    // suffixé par le stockage (`addRandomSuffix` par défaut), il ne peut ni
    // écraser l'image d'un autre lieu ni sortir de son préfixe.
    const blob = await put(`lairs/${lairId}/${file.name}`, file, { access: "public" });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error("Erreur lors de l'upload d'une image de lieu:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
