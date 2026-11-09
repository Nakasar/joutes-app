import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/middleware/admin";
import { STILL_IMAGE_KINDS, readImageUpload } from "@/lib/media/image-upload";


/**
 * Téléverse l'image (carrée) d'un succès vers Vercel Blob. Réservé aux
 * administrateurs. Renvoie l'URL publique à stocker sur le succès.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await checkAdmin())) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const formData = await request.formData();
    const upload = await readImageUpload(formData, { kinds: STILL_IMAGE_KINDS, maxMegabytes: 2 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

    // Nom de fichier normalisé pour la clé Blob (évite espaces/unicode/« / »).
    const safeName =
      file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "icone";
    const blob = await put(`achievements/icons/${Date.now()}-${safeName}`, file, {
      access: "public",
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Erreur lors de l'upload de l'icône de succès:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload de l'image" }, { status: 500 });
  }
}
